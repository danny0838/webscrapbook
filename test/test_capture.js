(function (global, factory) {
  global = typeof globalThis !== "undefined" ? globalThis : global || self;
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      global,
      require('./lib/unittest'),
      require('./t/common'),
      require('./shared/core/common'),
      require('./shared/lib/jszip'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['./lib/unittest', './t/common', './shared/core/common', './shared/lib/jszip'],
      (...args) => {
        return factory(global, ...args);
      },
    );
  } else {
    // Browser globals
    factory(
      global,
      global.unittest,
      global.utils,
      global.scrapbook,
      global.JSZip,
    );
  }
}(this, function (global, unittest, utils, scrapbook, JSZip) {

'use strict';

const {
  MochaQuery: $, assert, assertEqual, assertThrows,
  getRulesFromCssText, getToken, escapeRegExp, regex, rawRegex, cssRegex,
} = unittest;
const $it = $(it);
const {userAgent, delay} = utils;
const {
  xhr,
  readFileAsText, readFileAsArrayBuffer, readFileAsDataURL, readFileAsDocument,
} = scrapbook;

const r = String.raw;;

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
    checkTestServer(),
    checkExtension(),
  ]);
});

/**
 * Check html saving structure in various formats
 * Check if saveAs option works
 *
 * capture.saveAs
 * capturer.saveDocument
 * capturer.downloadBlob
 */
it('test_capture_html', async function () {
  /* htz */
  var options = {
    "capture.saveAs": "zip",
  };

  var blob = await capture({
    url: `${localhost}/capture_html/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  assert(blob.type === "application/html+zip");

  var zip = await new JSZip().loadAsync(blob);
  assert(zip);

  var indexFile = zip.file('index.html');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);
  assert(doc.contentType === "text/html");
  assert(doc.characterSet === "UTF-8");
  assert(doc.doctype.name === "html");
  assert(doc.doctype.publicId === "");
  assert(doc.doctype.systemId === "");

  assert(doc.querySelector('meta[charset="UTF-8"]'));
  assert(doc.title === 'ABC 中文 𠀀 にほんご');
  assert(doc.querySelector('p').textContent === 'ABC 中文 𠀀 にほんご');

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'red.bmp');
  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'blue.bmp');
  var imgFile = zip.file('blue.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');

  /* maff */
  var options = {
    "capture.saveAs": "maff",
  };

  var blob = await capture({
    url: `${localhost}/capture_html/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  assert(blob.type === "application/x-maff");

  var zip = await new JSZip().loadAsync(blob);
  assert(zip);
  var topdir = Object.keys(zip.files)[0];
  assert(zip.files[topdir].dir);
  assert(topdir.match(regex`^\d{17}/$`));

  var rdfFile = zip.file(topdir + 'index.rdf');
  assert(rdfFile);
  var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
  var doc = await readFileAsDocument(rdfBlob);
  assert(doc);
  var elem = doc.getElementsByTagNameNS(MAF, "title")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'ABC 中文 𠀀 にほんご');
  var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'index.html');
  var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'UTF-8');

  var indexFile = zip.file(topdir + 'index.html');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);
  assert(doc.contentType === "text/html");
  assert(doc.characterSet === "UTF-8");
  assert(doc.doctype.name === "html");
  assert(doc.doctype.publicId === "");
  assert(doc.doctype.systemId === "");

  assert(doc.querySelector('meta[charset="UTF-8"]'));
  assert(doc.title === 'ABC 中文 𠀀 にほんご');
  assert(doc.querySelector('p').textContent === 'ABC 中文 𠀀 にほんご');

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'red.bmp');
  var imgFile = zip.file(topdir + 'red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'blue.bmp');
  var imgFile = zip.file(topdir + 'blue.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');

  /* singleHtml */
  var options = {
    "capture.saveAs": "singleHtml",
  };

  var blob = await capture({
    url: `${localhost}/capture_html/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  assert(blob.type.match(rawRegex`${'^'}text/html${'(?:;|$)'}`));

  var doc = await readFileAsDocument(blob);
  assert(doc);
  assert(doc.contentType === "text/html");
  assert(doc.characterSet === "UTF-8");
  assert(doc.doctype.name === "html");
  assert(doc.doctype.publicId === "");
  assert(doc.doctype.systemId === "");

  assert(doc.querySelector('meta[charset="UTF-8"]'));
  assert(doc.title === 'ABC 中文 𠀀 にほんご');
  assert(doc.querySelector('p').textContent === 'ABC 中文 𠀀 にほんご');

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'data:image/bmp;filename=blue.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
});

/**
 * Check xhtml saving structure in various formats
 * Check if saveAs option works
 *
 * capture.saveAs
 * capturer.saveDocument
 * capturer.downloadBlob
 */
it('test_capture_xhtml', async function () {
  /* htz */
  var options = {
    "capture.saveAs": "zip",
  };

  var blob = await capture({
    url: `${localhost}/capture_xhtml/index.xhtml`,
    options: Object.assign({}, baseOptions, options),
  });
  assert(blob.type === "application/html+zip");

  var zip = await new JSZip().loadAsync(blob);
  assert(zip);

  var indexFile = zip.file('index.html');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);
  var metaRefreshElem = doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.xhtml"]');
  assert(metaRefreshElem);

  var indexFile = zip.file('index.xhtml');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);
  assert(doc.contentType === "application/xhtml+xml");
  assert(doc.characterSet === "UTF-8");
  assert(doc.doctype.name === "html");
  assert(doc.doctype.publicId === "-//W3C//DTD XHTML 1.1//EN");
  assert(doc.doctype.systemId === "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd");

  assert(doc.querySelector('meta[charset="UTF-8"]'));
  assert(doc.title === 'ABC 中文 𠀀 にほんご');
  assert(doc.querySelector('p').textContent === 'ABC 中文 𠀀 にほんご');

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'red.bmp');
  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'blue.bmp');
  var imgFile = zip.file('blue.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');

  /* maff */
  var options = {
    "capture.saveAs": "maff",
  };
  var blob = await capture({
    url: `${localhost}/capture_xhtml/index.xhtml`,
    options: Object.assign({}, baseOptions, options),
  });
  assert(blob.type === "application/x-maff");
  var zip = await new JSZip().loadAsync(blob);
  assert(zip);
  var topdir = Object.keys(zip.files)[0];
  assert(zip.files[topdir].dir);

  var rdfFile = zip.file(topdir + 'index.rdf');
  assert(rdfFile);
  var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
  var doc = await readFileAsDocument(rdfBlob);
  assert(doc);
  var elem = doc.getElementsByTagNameNS(MAF, "title")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'ABC 中文 𠀀 にほんご');
  var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'index.xhtml');
  var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'UTF-8');

  var indexFile = zip.file(topdir + 'index.html');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);
  var metaRefreshElem = doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.xhtml"]');
  assert(metaRefreshElem);

  var indexFile = zip.file(topdir + 'index.xhtml');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);
  assert(doc.contentType === "application/xhtml+xml");
  assert(doc.characterSet === "UTF-8");
  assert(doc.doctype.name === "html");
  assert(doc.doctype.publicId === "-//W3C//DTD XHTML 1.1//EN");
  assert(doc.doctype.systemId === "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd");

  assert(doc.querySelector('meta[charset="UTF-8"]'));
  assert(doc.title === 'ABC 中文 𠀀 にほんご');
  assert(doc.querySelector('p').textContent === 'ABC 中文 𠀀 にほんご');

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'red.bmp');
  var imgFile = zip.file(topdir + 'red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'blue.bmp');
  var imgFile = zip.file(topdir + 'blue.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');

  /* singleHtml */
  var options = {
    "capture.saveAs": "singleHtml",
  };
  var blob = await capture({
    url: `${localhost}/capture_xhtml/index.xhtml`,
    options: Object.assign({}, baseOptions, options),
  });
  assert(blob.type.match(rawRegex`${'^'}application/xhtml+xml${'(?:;|$)'}`));

  var doc = await readFileAsDocument(blob);
  assert(doc);
  assert(doc.contentType === "application/xhtml+xml");
  assert(doc.characterSet === "UTF-8");
  assert(doc.doctype.name === "html");
  assert(doc.doctype.publicId === "-//W3C//DTD XHTML 1.1//EN");
  assert(doc.doctype.systemId === "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd");

  assert(doc.querySelector('meta[charset="UTF-8"]'));
  assert(doc.title === 'ABC 中文 𠀀 にほんご');
  assert(doc.querySelector('p').textContent === 'ABC 中文 𠀀 にほんご');

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem);
  assert(imgElem.getAttribute('src') === 'data:image/bmp;filename=blue.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
});

/**
 * Check file saving structure in various formats
 * Check if saveAs option works
 *
 * capturer.captureFile
 */
it('test_capture_file', async function () {
  /* htz */
  var options = {
    "capture.saveAs": "zip",
    "capture.saveFileAsHtml": false,
  };

  var blob = await capture({
    url: `${localhost}/capture_file/file.bmp`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'file');
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0; url=file.bmp"]'));
  assert(doc.querySelector('a[href="file.bmp"]'));
  assert(!doc.querySelector('img'));

  var savedFile = zip.file('file.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

  /* maff */
  var options = {
    "capture.saveAs": "maff",
    "capture.saveFileAsHtml": false,
  };

  var blob = await capture({
    url: `${localhost}/capture_file/file.bmp`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var topdir = Object.keys(zip.files)[0];

  var rdfFile = zip.file(topdir + 'index.rdf');
  var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
  var doc = await readFileAsDocument(rdfBlob);
  assert(doc);
  var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'index.html');
  var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'UTF-8'); // for index.html

  var indexFile = zip.file(topdir + 'index.html');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'file');
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0; url=file.bmp"]'));
  assert(doc.querySelector('a[href="file.bmp"]'));
  assert(!doc.querySelector('img'));

  var savedFile = zip.file(topdir + 'file.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

  /* singleHtml */
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.saveFileAsHtml": false,
  };

  var blob = await capture({
    url: `${localhost}/capture_file/file.bmp`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assert(doc);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'file');
  var metaRefreshElem = doc.querySelector('meta[http-equiv="refresh"][content]');
  assert(metaRefreshElem);
  assert(metaRefreshElem.getAttribute('content') ===
    "0; url=data:image/bmp;filename=file.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
  assert(!doc.querySelector('a[href="file.bmp"]')); // do NOT generate anchor to avoid long content
  assert(!doc.querySelector('img'));
});

/**
 * Check plain text file encoding is correctly recorded
 *
 * capturer.captureFile
 */
it('test_capture_file_charset', async function () {
  var options = {
    "capture.saveAs": "maff",
  };

  /* txt (Big5) */
  var blob = await capture({
    url: `${localhost}/capture_file/big5.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var topdir = Object.keys(zip.files)[0];

  var rdfFile = zip.file(topdir + 'index.rdf');
  var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
  var doc = await readFileAsDocument(rdfBlob);
  var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'index.html');
  var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'UTF-8'); // for index.html

  var indexFile = zip.file(topdir + 'index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('meta[charset="UTF-8"]'));
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'file');
  assert(doc.documentElement.getAttribute('data-scrapbook-charset') === 'Big5');
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0; url=big5.py"]'));

  var savedFile = zip.file(topdir + 'big5.py');
  var text = (await readFileAsText(await savedFile.async('blob'), "Big5")).trim();
  assert(text === "Big5 中文內容");

  /* txt (UTF-8 BOM) */
  var blob = await capture({
    url: `${localhost}/capture_file/utf8.txt`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var topdir = Object.keys(zip.files)[0];

  var rdfFile = zip.file(topdir + 'index.rdf');
  var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
  var doc = await readFileAsDocument(rdfBlob);
  var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'index.html');
  var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
  assert(elem.getAttributeNS(RDF, "resource") === 'UTF-8'); // for index.html

  var indexFile = zip.file(topdir + 'index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('meta[charset="UTF-8"]'));
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'file');
  assert(doc.documentElement.getAttribute('data-scrapbook-charset') === 'UTF-8');
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0; url=utf8.txt"]'));

  var savedFile = zip.file(topdir + 'utf8.txt');
  var text = (await readFileAsText(await savedFile.async('blob'))).trim();
  // The UTF-8 BOM is not included here.
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
});

/**
 * URLs different only in hash should be considered identical.
 *
 * capturer.downloadFile
 */
it('test_capture_rename', async function () {
  var blob = await capture({
    url: `${localhost}/capture_rename/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `green.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `green.bmp#123`);
  assert(doc.querySelectorAll('img')[2].getAttribute('src') === `green.bmp#456`);
});

/**
 * Check URL normalization.
 *
 * capturer.fetch
 */
it('test_capture_rename_normalize', async function () {
  var blob = await capture({
    url: `${localhost}/capture_rename_normalize/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 3);
  assert(zip.file("index.html"));
  assert(zip.file("abc.bmp"));
  assert(zip.file("123ABCabc中文 !#$%&'()+,-;=@[]^_`{}_.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
  assert(imgs[1].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
  assert(imgs[2].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
  assert(imgs[3].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
  assert(imgs[4].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
  assert(imgs[5].getAttribute('src') === "abc.bmp#abc%E4%B8%AD%E6%96%87%");
  assert(imgs[6].getAttribute('src') === "abc.bmp#ab%63%e4%b8%ad%e6%96%87%25");
});

/**
 * Check saved filename is correctly determined by HTTP header
 * (filename, filename with encoding, or content-type)
 *
 * Check plain text file encoding is correctly recorded
 */
it('test_capture_header', async function () {
  var blob = await capture({
    url: `${localhost}/capture_header/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  // filename
  var savedFile = zip.file('file.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

  // FILENAME
  var savedFile = zip.file('file2.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

  // filename = "..."
  var savedFile = zip.file('file _X_.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

  // filename=...; filename*=iso-8859-1'en'...
  var savedFile = zip.file('£ rates.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

  // filename*=UTF-8''...; filename=...
  var savedFile = zip.file('中文𠀀.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

  // content-type; no file extension (should generate one)
  var savedFile = zip.file('noext.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
});

/**
 * If filename by URL path or header doesn't match its MIME type,
 * a fixing extension should be appended.
 *
 * capturer.downloadFile
 */
it('test_capture_header_mime', async function () {
  var blob = await capture({
    url: `${localhost}/capture_header_mime/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('img')[0].getAttribute("src") === "image_bmp.py.bmp")
  assert(zip.file("image_bmp.py.bmp"));
  assert(doc.querySelectorAll('img')[1].getAttribute("src") === "image_svg.py.svg")
  assert(zip.file("image_svg.py.svg"));

  // extension validation should be case-insensitive
  assert(doc.querySelectorAll('img')[2].getAttribute("src") === "image.SVG")
  assert(zip.file("image.SVG"));

  // a well-known MIME may have a new-age extension not known yet, don't overfix
  assert(doc.querySelectorAll('img')[3].getAttribute("src") === "newext.mp1")
  assert(zip.file("newext.mp1"));

  // always attempt to fix for a file without extension
  assert(doc.querySelectorAll('img')[4].getAttribute("src") === "noext.doc")
  assert(zip.file("noext.doc"));

  // allow empty extension for universal MIME types, e.g. application/octet-stream
  assert(doc.querySelectorAll('img')[5].getAttribute("src") === "noextoctet")
  assert(zip.file("noextoctet"));

  assert(doc.querySelectorAll('link')[0].getAttribute("href") === "stylesheet.py.css")
  assert(zip.file("stylesheet.py.css"));
  assert(doc.querySelectorAll('script')[0].getAttribute("src") === "script.py.js")
  assert(zip.file("script.py.js"));
});

/**
 * Check special char handling for saved resources
 *
 * scrapbook.validateFilename
 * scrapbook.escapeFilename
 */
it('test_capture_filename', async function () {
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
    assert(zip.file(fn));
  }

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgs = doc.querySelectorAll('img');
  EXPECTED_FILENAMES.forEach((fn, i) => {
    fn = fn.replace(/[ %#]+/g, m => encodeURIComponent(m));
    assert(imgs[i].getAttribute('src') === fn);
  });
});

/**
 * Check renaming for forbidden files
 *
 * capturer.getUniqueFilename
 * capturer.captureInfo.*.files
 */
it('test_capture_filename_forbidden', async function () {
  var blob = await capture({
    url: `${localhost}/capture_filename_forbidden/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index-1.json"));
  assert(zip.file("index-1.dat"));
  assert(zip.file("index-1.rdf"));
  assert(zip.file("^metadata^-1"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === "index-1.json");
  assert(imgs[1].getAttribute('src') === "index-1.dat");
  assert(imgs[2].getAttribute('src') === "index-1.rdf");
  assert(imgs[3].getAttribute('src') === "^metadata^-1");
});

/**
 * Check if redirection is handled correctly.
 *
 * - Filename should based on the redirected URL.
 *
 * - Hash should be the source hash.
 *
 * capturer.captureDocument
 */
it('test_capture_redirect', async function () {
  var options = {
    "capture.frameRename": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_redirect/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link').getAttribute('href') === `style.css#abc`);
  assert(doc.querySelector('img').getAttribute('src') === `green.bmp#abc`);
  assert(doc.querySelector('iframe').getAttribute('src') === `frame.html#abc`);
});

/**
 * Hash in the "Location" header should be ignored.
 *
 * @TODO: Browser usually use the "Location" header hash if it exists and use
 * the source URL hash if not. As the response URL of XMLHttpRequest and
 * fetch API doesn't contain hash, we use the source URL hash currently.
 */
it('test_capture_redirect_hash', async function () {
  var options = {
    "capture.frameRename": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_redirect_hash/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link').getAttribute('href') === `style.css#abc`);
  assert(doc.querySelector('img').getAttribute('src') === `green.bmp#abc`);
  assert(doc.querySelector('iframe').getAttribute('src') === `frame.html#abc`);
});

/**
 * Check if option works
 *
 * capture.saveAsciiFilename
 * capture.saveDataUriAsFile
 */
it('test_capture_saveAsciiFilename', async function () {
  /* -saveAsciiFilename */
  var options = {
    "capture.saveAsciiFilename": false,
  };
  var blob = await capture({
    url: `${localhost}/capture_saveAsciiFilename/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('123ABCabc_中文_𠀀.bmp'));
  assert(zip.file('123ABCabc_中文_𠀀-2.bmp'));
  assert(zip.file('123ABCabc_中文_𠀀.css'));
  assert(zip.file('123ABCabc_中文_𠀀.woff'));
  assert(zip.file('123%.dat'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href') === "123ABCabc_中文_𠀀.bmp");
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === "123ABCabc_中文_𠀀.css");
  assert(doc.querySelector('style').textContent.trim() === `@import url("123ABCabc_中文_𠀀.css");
@font-face { font-family: myFont; src: url("123ABCabc_中文_𠀀.woff"); }
p { background-image: url("123ABCabc_中文_𠀀.bmp"); }`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === "123ABCabc_中文_𠀀.bmp");
  assert(doc.querySelectorAll('img')[1].getAttribute('srcset') === "123ABCabc_中文_𠀀.bmp 1x, 123ABCabc_中文_𠀀-2.bmp 2x");
  assert(doc.querySelectorAll('img')[2].getAttribute('src') === "123%25.dat");

  /* +saveAsciiFilename */
  var options = {
    "capture.saveAsciiFilename": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_saveAsciiFilename/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80.bmp'));
  assert(zip.file('123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80-2.bmp'));
  assert(zip.file('123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80.css'));
  assert(zip.file('123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80.woff'));
  assert(zip.file('123%.dat'));

  // URLs in the page need to be encoded to represent a percent char,
  // and thus the output looks like %25xx%25xx...
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href') === "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp");
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.css");
  assert(doc.querySelector('style').textContent.trim() === `@import url("123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.css");
@font-face { font-family: myFont; src: url("123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.woff"); }
p { background-image: url("123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp"); }`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp");
  assert(doc.querySelectorAll('img')[1].getAttribute('srcset') === "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp 1x, 123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580-2.bmp 2x");
  assert(doc.querySelectorAll('img')[2].getAttribute('src') === "123%25.dat");
});

/**
 * Check if option works
 *
 * capture.saveFileAsHtml
 */
it('test_capture_saveFileAsHtml', async function () {
  var options = {
    "capture.saveFileAsHtml": true,
  };

  /* bmp */
  var blob = await capture({
    url: `${localhost}/capture_file/file.bmp`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') !== 'file');
  assert(!doc.querySelector('meta[http-equiv="refresh"]'));
  assert(doc.body.querySelector('img'));

  /* txt (Big5) */
  var blob = await capture({
    url: `${localhost}/capture_file/big5.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.characterSet === "UTF-8");
  assert(doc.documentElement.getAttribute('data-scrapbook-type') !== 'file');
  assert(!doc.querySelector('meta[http-equiv="refresh"]'));
  var preElem = doc.body.querySelector('pre');
  assert(preElem.textContent.trim() === "Big5 中文內容");

  /* txt (UTF-8 BOM) */
  var blob = await capture({
    url: `${localhost}/capture_file/utf8.txt`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') !== 'file');
  assert(!doc.querySelector('meta[http-equiv="refresh"]'));
  var preElem = doc.body.querySelector('pre');
  assert(preElem.textContent.trim() === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
});

/**
 * Check if option works
 *
 * capture.saveDataUriAsFile
 */
it('test_capture_dataUri', async function () {
  /* -saveDataUriAsFile */
  var options = {
    "capture.saveDataUriAsFile": false,
  };
  var blob = await capture({
    url: `${localhost}/capture_dataUri/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === "data:text/css;charset=UTF-8,body%7Bfont-size:20px;%7D");
  assert(doc.querySelector('style').textContent.trim() === `\
@import url("data:text/css;charset=UTF-8,body%7Bfont-size:20px;%7D");
@font-face { font-family: myFont; src: url("data:font/woff;base64,"); }
p { background-image: url("data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"); }`);
  assert(doc.querySelector('img').getAttribute('src') === "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA 1x, data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA 2x");

  /* +saveDataUriAsFile */
  var options = {
    "capture.saveDataUriAsFile": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_dataUri/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('2206b4fb7241bdce17a71015c888e3de66c2b5c9.css'));
  assert(zip.file('da39a3ee5e6b4b0d3255bfef95601890afd80709.woff'));
  assert(zip.file('ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp'));
  assert(zip.file('4c46aef7be4ed4dda8cb2e887ae3ca7a8702fa16.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === "2206b4fb7241bdce17a71015c888e3de66c2b5c9.css");
  assert(doc.querySelector('style').textContent.trim() === `\
@import url("2206b4fb7241bdce17a71015c888e3de66c2b5c9.css");
@font-face { font-family: myFont; src: url("da39a3ee5e6b4b0d3255bfef95601890afd80709.woff"); }
p { background-image: url("ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp"); }`);
  assert(doc.querySelector('img').getAttribute('src') === "ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp");
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === "ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp 1x, 4c46aef7be4ed4dda8cb2e887ae3ca7a8702fa16.bmp 2x");

  /* +saveDataUriAsFile + singleHtml */
  // saveDataUriAsFile should be ignored if save as singleHtml.
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.saveDataUriAsFile": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_dataUri/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === "data:text/css;charset=UTF-8,body%7Bfont-size:20px;%7D");
  assert(doc.querySelector('style').textContent.trim() === `\
@import url("data:text/css;charset=UTF-8,body%7Bfont-size:20px;%7D");
@font-face { font-family: myFont; src: url("data:font/woff;base64,"); }
p { background-image: url("data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"); }`);
  assert(doc.querySelector('img').getAttribute('src') === "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA 1x, data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA 2x");
});

/**
 * Check URL resolution in a data URL CSS
 *
 * capture.saveDataUriAsFile
 * capturer.downloadFile
 * capturer.DocumentCssHandler
 */
it('test_capture_dataUri_css', async function () {
  var options = {
    "capture.style": "save",
    "capture.font": "save",
    "capture.imageBackground": "save",
  };

  /* -saveDataUriAsFile; relative link in data URL CSS */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_css/resolve_css_1.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var url = doc.querySelector('link').getAttribute('href');
  var text = (await xhr({url, responseType: "text"})).response;
  assert(text === `\
@import "null.css";
@font-face { font-family: invalid; src: url("null.woff"); }
#invalid { background-image: url("red.bmp"); }`);

  /* -saveDataUriAsFile; absolute link in data URL CSS */
  // absolute link => force saved as a data URL (relative link won't work if saved as file)
  options["capture.saveDataUriAsFile"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_css/resolve_css_2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var url = doc.querySelector('link').getAttribute('href');
  var text = (await xhr({url, responseType: "text"})).response;
  assert(text === `\
@import "data:text/css;charset=UTF-8;filename=null.css,";
@font-face { font-family: myFont; src: url("data:font/woff;filename=null.woff;base64,"); }
p { background-image: url("data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"); }`);

  /* +saveDataUriAsFile; relative link in data URL CSS */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_css/resolve_css_1.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 2); // main + link css

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file(doc.querySelector('link').getAttribute('href'));
  var text = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(text === `\
@import "null.css";
@font-face { font-family: invalid; src: url("null.woff"); }
#invalid { background-image: url("red.bmp"); }`);

  /* +saveDataUriAsFile; absolute link in data URL CSS */
  // absolute link => save as file
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_css/resolve_css_2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('null.css'));
  assert(zip.file('null.woff'));
  assert(zip.file('red.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file(doc.querySelector('link').getAttribute('href'));
  var text = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(text === `\
@import "null.css";
@font-face { font-family: myFont; src: url("null.woff"); }
p { background-image: url("red.bmp"); }`);
});

/**
 * Check URL resolution in a data URL frame
 *
 * capture.saveDataUriAsFile
 * capture.saveDataUriAsSrcdoc
 * capturer.captureDocument
 */
it('test_capture_dataUri_frame', async function () {
  var options = {
    "capture.frame": "save",
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": "txt",
    "capture.downLink.doc.depth": 1,
    "capture.downLink.urlFilter": "",
  };

  /* -saveDataUriAsFile; -saveDataUriAsSrcdoc; relative link in data URL iframe */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = false;
  options["capture.saveDataUriAsSrcdoc"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_frame/resolve_frame_1.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 2);  // index.html, index.json

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frameSrc = doc.querySelector('iframe').getAttribute('src');
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

  assert(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
  assert(frameDoc.querySelector('meta[property="og:image"][content="null.bmp"]'));
  assert(frameDoc.querySelector('link[rel~="icon"][href="null.bmp"]'));
  assert(frameDoc.querySelector('link[rel="stylesheet"][href="null.css"]'));
  assert(frameDoc.querySelector('script[src="null.js"]'));
  assert(frameDoc.querySelector('img[src="null.bmp"]'));
  assert(frameDoc.querySelector('img[srcset="null.bmp 1x, null.bmp 2x"]'));
  assert(frameDoc.querySelector('picture source[srcset="null.bmp"]'));
  assert(frameDoc.querySelector('input[type="image"][src="null.bmp"]'));
  assert(frameDoc.querySelector('div').getAttribute('style') === `background: url("null.bmp");`);
  assert(frameDoc.querySelector('table[background="null.bmp"]'));
  assert(frameDoc.querySelector('tr[background="null.bmp"]'));
  assert(frameDoc.querySelector('th[background="null.bmp"]'));
  assert(frameDoc.querySelector('td[background="null.bmp"]'));
  assert(frameDoc.querySelector('audio[src="null.mp3"]'));
  assert(frameDoc.querySelector('audio source[src="null.ogg"]'));
  assert(frameDoc.querySelector('video[src="null.mp4"][poster="null.bmp"]'));
  assert(frameDoc.querySelector('video source[src="null.webm"]'));
  assert(frameDoc.querySelector('embed[src="null.swf"]'));
  assert(frameDoc.querySelector('object[data="null.swf"]'));
  assert(frameDoc.querySelector('applet[code="null.class"][archive="null.jar"]'));
  assert(frameDoc.querySelector('a[href="null.txt"]'));
  assert(frameDoc.querySelector('a[href="null.html"]'));

  /* -saveDataUriAsFile; +saveDataUriAsSrcdoc; relative link in data URL iframe */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = false;
  options["capture.saveDataUriAsSrcdoc"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_frame/resolve_frame_1.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 2);  // index.html, index.json

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frameSrc = `data:text/html;charset=UTF-8,${encodeURIComponent(doc.querySelector('iframe').getAttribute('srcdoc'))}`;
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

  assert(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
  assert(frameDoc.querySelector('meta[property="og:image"][content="null.bmp"]'));
  assert(frameDoc.querySelector('link[rel~="icon"][href="null.bmp"]'));
  assert(frameDoc.querySelector('link[rel="stylesheet"][href="null.css"]'));
  assert(frameDoc.querySelector('script[src="null.js"]'));
  assert(frameDoc.querySelector('img[src="null.bmp"]'));
  assert(frameDoc.querySelector('img[srcset="null.bmp 1x, null.bmp 2x"]'));
  assert(frameDoc.querySelector('picture source[srcset="null.bmp"]'));
  assert(frameDoc.querySelector('input[type="image"][src="null.bmp"]'));
  assert(frameDoc.querySelector('div').getAttribute('style') === `background: url("null.bmp");`);
  assert(frameDoc.querySelector('table[background="null.bmp"]'));
  assert(frameDoc.querySelector('tr[background="null.bmp"]'));
  assert(frameDoc.querySelector('th[background="null.bmp"]'));
  assert(frameDoc.querySelector('td[background="null.bmp"]'));
  assert(frameDoc.querySelector('audio[src="null.mp3"]'));
  assert(frameDoc.querySelector('audio source[src="null.ogg"]'));
  assert(frameDoc.querySelector('video[src="null.mp4"][poster="null.bmp"]'));
  assert(frameDoc.querySelector('video source[src="null.webm"]'));
  assert(frameDoc.querySelector('embed[src="null.swf"]'));
  assert(frameDoc.querySelector('object[data="null.swf"]'));
  assert(frameDoc.querySelector('applet[code="null.class"][archive="null.jar"]'));
  assert(frameDoc.querySelector('a[href="null.txt"]'));
  assert(frameDoc.querySelector('a[href="null.html"]'));

  /* +saveDataUriAsFile; relative link in data URL iframe */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = true;
  options["capture.saveDataUriAsSrcdoc"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_frame/resolve_frame_1.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frameSrc = doc.querySelector('iframe').getAttribute('src');
  var frameFile = zip.file(frameSrc);
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  assert(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
  assert(frameDoc.querySelector('meta[property="og:image"][content="null.bmp"]'));
  assert(frameDoc.querySelector('link[rel~="icon"][href="null.bmp"]'));
  assert(frameDoc.querySelector('link[rel="stylesheet"][href="null.css"]'));
  assert(frameDoc.querySelector('script[src="null.js"]'));
  assert(frameDoc.querySelector('img[src="null.bmp"]'));
  assert(frameDoc.querySelector('img[srcset="null.bmp 1x, null.bmp 2x"]'));
  assert(frameDoc.querySelector('picture source[srcset="null.bmp"]'));
  assert(frameDoc.querySelector('input[type="image"][src="null.bmp"]'));
  assert(frameDoc.querySelector('div').getAttribute('style') === `background: url("null.bmp");`);
  assert(frameDoc.querySelector('table[background="null.bmp"]'));
  assert(frameDoc.querySelector('tr[background="null.bmp"]'));
  assert(frameDoc.querySelector('th[background="null.bmp"]'));
  assert(frameDoc.querySelector('td[background="null.bmp"]'));
  assert(frameDoc.querySelector('audio[src="null.mp3"]'));
  assert(frameDoc.querySelector('audio source[src="null.ogg"]'));
  assert(frameDoc.querySelector('video[src="null.mp4"][poster="null.bmp"]'));
  assert(frameDoc.querySelector('video source[src="null.webm"]'));
  assert(frameDoc.querySelector('embed[src="null.swf"]'));
  assert(frameDoc.querySelector('object[data="null.swf"]'));
  assert(frameDoc.querySelector('applet[code="null.class"][archive="null.jar"]'));
  assert(frameDoc.querySelector('a[href="null.txt"]'));
  assert(frameDoc.querySelector('a[href="null.html"]'));

  /* -saveDataUriAsFile; -saveDataUriAsSrcdoc; absolute link in data URL iframe */
  // absolute link => force saved as a data URL (relative link won't work if saved as file)
  // in-depth page is linked to source since it cannot be saved as data URL
  options["capture.saveDataUriAsFile"] = false;
  options["capture.saveDataUriAsSrcdoc"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_frame/resolve_frame_2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 2);  // index.html, index.json

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frameSrc = doc.querySelector('iframe').getAttribute('src');
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

  assert(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
  assert(frameDoc.querySelector('img').getAttribute('src') === `data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`);
  assert(frameDoc.querySelectorAll('a')[0].getAttribute('href') === `data:text/plain;filename=file.txt,Linked%20file.`);
  assert(frameDoc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_dataUri_frame/page.html`);

  /* -saveDataUriAsFile; +saveDataUriAsSrcdoc; absolute link in data URL iframe */
  // absolute link => save as file
  options["capture.saveDataUriAsFile"] = false;
  options["capture.saveDataUriAsSrcdoc"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_frame/resolve_frame_2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("red.bmp"));
  assert(zip.file("file.txt"));
  assert(zip.file("page.html"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frameSrc = `data:text/html;charset=UTF-8,${encodeURIComponent(doc.querySelector('iframe').getAttribute('srcdoc'))}`;
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

  assert(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
  assert(frameDoc.querySelector('img[src="red.bmp"]'));
  assert(frameDoc.querySelector('a[href="file.txt"]'));
  assert(frameDoc.querySelector('a[href="page.html"]'));

  /* +saveDataUriAsFile; absolute link in data URL iframe */
  // absolute link => save as file
  options["capture.saveDataUriAsFile"] = true;
  options["capture.saveDataUriAsSrcdoc"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri_frame/resolve_frame_2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("red.bmp"));
  assert(zip.file("file.txt"));
  assert(zip.file("page.html"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frameSrc = doc.querySelector('iframe').getAttribute('src');
  var frameFile = zip.file(frameSrc);
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  assert(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
  assert(frameDoc.querySelector('img[src="red.bmp"]'));
  assert(frameDoc.querySelector('a[href="file.txt"]'));
  assert(frameDoc.querySelector('a[href="page.html"]'));
});

/**
 * Capture current page content for a frame with data URL.
 *
 * capturer.captureDocument
 */
$it.xfail()('test_capture_dataUri_frame_dynamic', async function () {
  var options = {
    "capture.frame": "save",
    "capture.saveDataUriAsFile": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_dataUri_frame_dynamic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index_1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assertEqual(doc.querySelector('p').textContent, 'page content modified');
});

/**
 * Check support of parameters in a data URL
 *
 * capture.saveDataUriAsFile
 */
it('test_capture_dataUri_params', async function () {
  var blob = await capture({
    url: `${localhost}/capture_dataUri_params/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.rdf.css"));
  assert(zip.file("index.dat.css"));
  assert(zip.file("^metadata^.css"));

  assert(zip.file("abc.html"));
  assert(zip.file("abc.xml"));
  assert(zip.file("abc.bmp"));
  assert(zip.file("abc.jpeg"));
  assert(zip.file("abc.gif"));
  assert(zip.file("abc.png"));
  assert(zip.file("abc.svg"));
  assert(zip.file("abc.wav"));
  assert(zip.file("abcd.wav"));
  assert(zip.file("abc.mp3"));
  assert(zip.file("abc.oga"));
  assert(zip.file("abc.ogx"));
  assert(zip.file("abc.mpga"));
  assert(zip.file("abc.mp4"));
  assert(zip.file("abc.webm"));
  assert(zip.file("abc.ogv"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var links = doc.querySelectorAll('link');
  assert(links[0].getAttribute('href') === "index.rdf.css");
  assert(links[1].getAttribute('href') === "index.dat.css");
  assert(links[2].getAttribute('href') === "^metadata^.css");

  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === "abc.html");
  assert(imgs[1].getAttribute('src') === "abc.xml");
  assert(imgs[2].getAttribute('src') === "abc.bmp");
  assert(imgs[3].getAttribute('src') === "abc.jpeg");
  assert(imgs[4].getAttribute('src') === "abc.gif");
  assert(imgs[5].getAttribute('src') === "abc.png");
  assert(imgs[6].getAttribute('src') === "abc.svg");
  assert(imgs[7].getAttribute('src') === "abc.wav");
  assert(imgs[8].getAttribute('src') === "abcd.wav");
  assert(imgs[9].getAttribute('src') === "abc.mp3");
  assert(imgs[10].getAttribute('src') === "abc.oga");
  assert(imgs[11].getAttribute('src') === "abc.ogx");
  assert(imgs[12].getAttribute('src') === "abc.mpga");
  assert(imgs[13].getAttribute('src') === "abc.mp4");
  assert(imgs[14].getAttribute('src') === "abc.webm");
  assert(imgs[15].getAttribute('src') === "abc.ogv");
});

/**
 * Check encoding and charset for getnerated data URLs.
 *
 * - Don't use Base64 encoding for text-like files.
 * - CSS should always use UTF-8 charset.
 *
 * capturer.captureDocument
 * capturer.downloadBlob
 */
it('test_capture_singleHtml_encoding', async function () {
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.mergeCssResources": false,
    "capture.image": "save",
    "capture.frame": "save",
    "capture.imageBackground": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_singleHtml_encoding/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  assert(doc.querySelectorAll('style')[0].textContent.trim() === `\
#internal { background: url("data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA"); }
#internal::after { content: "內部"; }`);
  assert(doc.querySelector('link').getAttribute('href') === `\
data:text/css;charset=UTF-8;filename=link.css,%23external%20%7B%20background:%20url(%22data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA%22);%20%7D%0A%23external::after%20%7B%20content:%20%22外部%22;%20%7D%0A`);
  assert(doc.querySelectorAll('style')[1].textContent.trim() === `\
@import "data:text/css;charset=UTF-8;filename=import.css,%23import%20%7B%20background:%20url(%22data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA%22);%20%7D%0A%23import::after%20%7B%20content:%20%22匯入%22;%20%7D%0A";`);
  assert(doc.querySelector('img').getAttribute('src') === `data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `data:text/plain;filename=big5.txt,Big5%A4%A4%A4%E5%A4%BA%AEe`);

  var srcdocBlob = new Blob([doc.querySelectorAll('iframe')[0].getAttribute('srcdoc')], {type: "text/html;charset=UTF-8"});
  var srcdoc = await readFileAsDocument(srcdocBlob);
  assert(srcdoc.querySelector('style').textContent.trim() === `\
#internal { background: url("data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA"); }
#internal::after { content: "內部"; }`);
  assert(srcdoc.querySelector('img').getAttribute('src') === `data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`);
});

/**
 * Check if CSS recources merging works
 *
 * capturer.captureDocument
 */
it('test_capture_singleHtml_mergeCss', async function () {
  /* capture.mergeCssResources = true */
  var options = {
    "capture.mergeCssResources": true,
    "capture.saveAs": "singleHtml",
    "capture.imageBackground": "save",
    "capture.font": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_singleHtml_mergeCss/index.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(cssText !== cssText2);
  assert(cssText2 === `#link { background: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }`);

  // internal
  var cssText = styles[2].textContent.trim();
  var cssText2 = cssText.replace(/var\(--sb\d+-\d+\)/g, x => map[x] || x);
  assert(cssText !== cssText2);
  assert(cssText2 === `#internal { background: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }`);

  // internal keyframe
  var cssText = styles[3].textContent.trim();
  var cssText2 = cssText.replace(/var\(--sb\d+-\d+\)/g, x => map[x] || x);
  assert(cssText !== cssText2);
  assert(cssText2 === `\
@keyframes spin {
  from { transform: rotate(0turn); background-image: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }
  to { transform: rotate(1turn); }
}`);

  /* capture.mergeCssResources = false */
  var options = {
    "capture.mergeCssResources": false,
    "capture.saveAs": "singleHtml",
    "capture.imageBackground": "save",
    "capture.font": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_singleHtml_mergeCss/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var styles = doc.querySelectorAll('style');

  assert(!doc.querySelector('style[data-scrapbook-elem="css-resource-map"]'));

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
  assert(cssText === `#link { background: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }`);

  // internal
  var cssText = styles[2].textContent.trim();
  assert(cssText === `#internal { background: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }`);

  // internal keyframe
  var cssText = styles[3].textContent.trim();
  assert(cssText === `\
@keyframes spin {
  from { transform: rotate(0turn); background-image: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }
  to { transform: rotate(1turn); }
}`);
});

/**
 * Generated filename parameter of data URL should use non-uniquified filename.
 */
it('test_capture_singleHtml_filename', async function () {
  var options = {
    "capture.saveAs": "singleHtml",
  };

  var blob = await capture({
    url: `${localhost}/capture_singleHtml_filename/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var imgs = doc.querySelectorAll('img');

  assert(imgs[0].getAttribute('src') === `data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`);
  assert(imgs[1].getAttribute('src') === `data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`);
  assert(imgs[2].getAttribute('src') === `data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`);
});

/**
 * Check if blob URLs can be correctly captured.
 *
 * capturer.downloadFile
 * capturer.fetchCSS
 */
it('test_capture_blob', async function () {
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
  assert(m[1] === fontFn);
  assert(m[2] === imgFn);

  var re = rawRegex`@font-face { font-family: styleFont; src: url("${regex`(${uuid}\.woff)`}"); }
#style-font { font-family: styleFont; }
#style-bg { background-image: url("${regex`(${uuid}\.bmp)`}"); }`;
  assert(m = doc.querySelector('style').textContent.trim().match(re));
  assert(m[1] === fontFn);
  assert(m[2] === imgFn);

  assert(doc.querySelector('img').getAttribute('src') === imgFn);
});

/**
 * Check handling of revoked blob URLs.
 *
 * capturer.downloadFile
 * capturer.fetchCSS
 */
it('test_capture_blob_revoked', async function () {
  var blob = await capture({
    url: `${localhost}/capture_blob_revoked/revoked.html`,
    options: baseOptions,
  }, {delay: 1000});

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link').getAttribute('href') === 'urn:scrapbook:download:error:blob:');
  assert(doc.querySelector('style').textContent.trim() === `\
@font-face { font-family: styleFont; src: url("urn:scrapbook:download:error:blob:"); }
#style-font { font-family: styleFont; }
#style-bg { background-image: url("urn:scrapbook:download:error:blob:"); }`);
  assert(doc.querySelector('img').getAttribute('src') === 'urn:scrapbook:download:error:blob:');
});

/**
 * Check handling of blob URLs in an iframe.
 */
it('test_capture_blob_frame', async function () {
  var blob = await capture({
    url: `${localhost}/capture_blob_frame/basic.html`,
    options: baseOptions,
  }, {delay: 500});

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('iframe').getAttribute('src') === 'index_1.html');

  var indexFile = zip.file('index_1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var uuid = r`[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}`;
  var re = regex`${uuid}\.bmp`;
  assert(doc.querySelector('img').getAttribute('src').match(re));
});

/**
 * about: URLs should be kept as-is.
 *
 * capturer.captureDocument
 * capturer.DocumentCssHandler.rewriteCssText
 */
async function test_capture_about() {
  var blob = await capture({
    url: `${localhost}/capture_about/basic.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('link').getAttribute('href') === 'blank');
  assert(doc.querySelector('style').textContent.trim() === `\
@import url("blank");
@font-face { font-family: myFont; src: url("about:blank"); }
p { background-image: url("about:blank"); }`);
  assert(doc.querySelector('img[src]').getAttribute('src') === 'about:blank');
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === 'about:blank 1x, about:invalid 2x');

  var cssFile = zip.file('blank');
  var text = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(text === '');
}

/**
 * Check if capture selection works
 *
 * capturer.captureDocument
 */
it('test_capture_selection', async function () {
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
  assert(selectedParentElem);
  assert(doc.querySelector('#selected'));
  assert(doc.querySelector('img[src="green.bmp"]'));
  assert(zip.file("green.bmp"));

  assert(selectedParentElem.firstChild.nodeType === 8);
  assert(selectedParentElem.firstChild.nodeValue === 'scrapbook-capture-selected');
  assert(selectedParentElem.lastChild.nodeType === 8);
  assert(selectedParentElem.lastChild.nodeValue === '/scrapbook-capture-selected');

  // non-selected elements and resources
  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.file("red.bmp"));

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.file("blue.bmp"));
});

/**
 * Test selecting single element
 *
 * capturer.captureDocument
 */
it('test_capture_selection_element', async function () {
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
  assert(selectedElem);
  assert(doc.querySelector('#selected'));
  assert(doc.querySelector('img[src="green.bmp"]'));
  assert(zip.file("green.bmp"));

  assert(selectedElem.previousSibling.nodeType === 8);
  assert(selectedElem.previousSibling.nodeValue === 'scrapbook-capture-selected');
  assert(selectedElem.nextSibling.nodeType === 8);
  assert(selectedElem.nextSibling.nodeValue === '/scrapbook-capture-selected');

  // non-selected elements and resources
  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.file("red.bmp"));

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.file("blue.bmp"));
});

/**
 * Test selecting text node
 *
 * capturer.captureDocument
 */
it('test_capture_selection_text', async function () {
  var blob = await capture({
    url: `${localhost}/capture_selection/selection_text.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // selected elements and resources
  assert(doc.querySelector('#selection'));
  assert(doc.querySelector('#selected'));
  assert(doc.querySelector('#selected').textContent === 'elect');
  assert(doc.querySelector('#selected').firstChild.nodeType === 8);
  assert(doc.querySelector('#selected').firstChild.nodeValue === 'scrapbook-capture-selected');
  assert(doc.querySelector('#selected').lastChild.nodeType === 8);
  assert(doc.querySelector('#selected').lastChild.nodeValue === '/scrapbook-capture-selected');

  // non-selected elements and resources
  assert(!doc.querySelector('img[src="green.bmp"]'));
  assert(!zip.file("green.bmp"));

  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.file("red.bmp"));

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.file("blue.bmp"));
});

/**
 * Test selecting comment node
 *
 * capturer.captureDocument
 */
it('test_capture_selection_comment', async function () {
  var blob = await capture({
    url: `${localhost}/capture_selection/selection_comment.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // selected elements and resources
  assert(doc.querySelector('#selection'));
  assert(doc.querySelector('#selected'));
  assert(doc.querySelector('#selected').childNodes[1].nodeType === 8);
  assert(doc.querySelector('#selected').childNodes[1].nodeValue === 'men');
  assert(doc.querySelector('#selected').firstChild.nodeType === 8);
  assert(doc.querySelector('#selected').firstChild.nodeValue === 'scrapbook-capture-selected');
  assert(doc.querySelector('#selected').lastChild.nodeType === 8);
  assert(doc.querySelector('#selected').lastChild.nodeValue === '/scrapbook-capture-selected');

  // non-selected elements and resources
  assert(!doc.querySelector('img[src="green.bmp"]'));
  assert(!zip.file("green.bmp"));

  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.file("red.bmp"));

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.file("blue.bmp"));
});

/**
 * Test selecting CDATA node (for XHTML)
 *
 * capturer.captureDocument
 */
it('test_capture_selection_cdata', async function () {
  var blob = await capture({
    url: `${localhost}/capture_selection/selection_cdata.xhtml`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.xhtml');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
  var doc = await readFileAsDocument(indexBlob);

  // selected elements and resources
  assert(doc.querySelector('#selection'));
  assert(doc.querySelector('#selected'));
  assert(doc.querySelector('#selected').childNodes[1].nodeType === 4);
  assert(doc.querySelector('#selected').childNodes[1].nodeValue === '< y >');
  assert(doc.querySelector('#selected').firstChild.nodeType === 8);
  assert(doc.querySelector('#selected').firstChild.nodeValue === 'scrapbook-capture-selected');
  assert(doc.querySelector('#selected').lastChild.nodeType === 8);
  assert(doc.querySelector('#selected').lastChild.nodeValue === '/scrapbook-capture-selected');

  // non-selected elements and resources
  assert(!doc.querySelector('img[src="green.bmp"]'));
  assert(!zip.file("green.bmp"));

  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.file("red.bmp"));

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.file("blue.bmp"));
});

/**
 * Test multiple selections
 *
 * capturer.captureDocument
 */
$it.skipIf($.noMultipleSelection)('test_capture_selection_multiple', async function () {
  var blob = await capture({
    url: `${localhost}/capture_selection/selection_multiple.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // selected elements and resources
  assert(doc.querySelector('#selection'));
  assert(doc.querySelector('#selected'));
  assert(doc.querySelector('img[src="green.bmp"]'));
  assert(zip.file("green.bmp"));

  assert(doc.querySelector('#selection2'));
  assert(doc.querySelector('#selected2'));
  assert(doc.querySelector('img[src="yellow.bmp"]'));
  assert(zip.file("yellow.bmp"));

  // non-selected elements and resources
  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.file("red.bmp"));

  assert(!doc.querySelector('#middle'));

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.file("blue.bmp"));
});

/**
 * Test multiple selections of text and comment
 *
 * capturer.captureDocument
 */
$it.skipIf($.noMultipleSelection)('test_capture_selection_multiple_text', async function () {
  var blob = await capture({
    url: `${localhost}/capture_selection/selection_multiple_text.xhtml`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.xhtml');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
  var doc = await readFileAsDocument(indexBlob);

  // selected elements and resources
  assert(doc.querySelector('#selection'));
  assert(doc.querySelector('#selected'));

  assert(doc.querySelector('#selected').childNodes[0].nodeType === 8);
  assert(doc.querySelector('#selected').childNodes[0].nodeValue === 'scrapbook-capture-selected');
  assert(doc.querySelector('#selected').childNodes[1].nodeType === 3);
  assert(doc.querySelector('#selected').childNodes[1].nodeValue === 'elect');
  assert(doc.querySelector('#selected').childNodes[2].nodeType === 8);
  assert(doc.querySelector('#selected').childNodes[2].nodeValue === '/scrapbook-capture-selected');
  assert(doc.querySelector('#selected').childNodes[3].nodeType === 8);
  assert(doc.querySelector('#selected').childNodes[3].nodeValue === 'scrapbook-capture-selected-splitter');
  assert(doc.querySelector('#selected').childNodes[4].nodeType === 3);
  assert(doc.querySelector('#selected').childNodes[4].nodeValue === ' … ');
  assert(doc.querySelector('#selected').childNodes[5].nodeType === 8);
  assert(doc.querySelector('#selected').childNodes[5].nodeValue === '/scrapbook-capture-selected-splitter');
  assert(doc.querySelector('#selected').childNodes[6].nodeType === 8);
  assert(doc.querySelector('#selected').childNodes[6].nodeValue === 'scrapbook-capture-selected');
  assert(doc.querySelector('#selected').childNodes[7].nodeType === 3);
  assert(doc.querySelector('#selected').childNodes[7].nodeValue === 'con');
  assert(doc.querySelector('#selected').childNodes[8].nodeType === 8);
  assert(doc.querySelector('#selected').childNodes[8].nodeValue === '/scrapbook-capture-selected');

  assert(doc.querySelector('#selection2'));
  assert(doc.querySelector('#selected2'));

  assert(doc.querySelector('#selected2').childNodes[0].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[0].nodeValue === 'scrapbook-capture-selected');
  assert(doc.querySelector('#selected2').childNodes[1].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[1].nodeValue === 'men');
  assert(doc.querySelector('#selected2').childNodes[2].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[2].nodeValue === '/scrapbook-capture-selected');
  assert(doc.querySelector('#selected2').childNodes[3].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[3].nodeValue === 'scrapbook-capture-selected-splitter');
  assert(doc.querySelector('#selected2').childNodes[4].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[4].nodeValue === ' … ');
  assert(doc.querySelector('#selected2').childNodes[5].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[5].nodeValue === '/scrapbook-capture-selected-splitter');
  assert(doc.querySelector('#selected2').childNodes[6].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[6].nodeValue === 'scrapbook-capture-selected');
  assert(doc.querySelector('#selected2').childNodes[7].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[7].nodeValue === 'str');
  assert(doc.querySelector('#selected2').childNodes[8].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[8].nodeValue === '/scrapbook-capture-selected');

  assert(doc.querySelector('#selected2').childNodes[9].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[9].nodeValue === 'scrapbook-capture-selected');
  assert(doc.querySelector('#selected2').childNodes[10].nodeType === 4);
  assert(doc.querySelector('#selected2').childNodes[10].nodeValue === 'x');
  assert(doc.querySelector('#selected2').childNodes[11].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[11].nodeValue === '/scrapbook-capture-selected');
  assert(doc.querySelector('#selected2').childNodes[12].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[12].nodeValue === 'scrapbook-capture-selected-splitter');
  assert(doc.querySelector('#selected2').childNodes[13].nodeType === 3);
  assert(doc.querySelector('#selected2').childNodes[13].nodeValue === ' … ');
  assert(doc.querySelector('#selected2').childNodes[14].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[14].nodeValue === '/scrapbook-capture-selected-splitter');
  assert(doc.querySelector('#selected2').childNodes[15].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[15].nodeValue === 'scrapbook-capture-selected');
  assert(doc.querySelector('#selected2').childNodes[16].nodeType === 4);
  assert(doc.querySelector('#selected2').childNodes[16].nodeValue === 'z');
  assert(doc.querySelector('#selected2').childNodes[17].nodeType === 8);
  assert(doc.querySelector('#selected2').childNodes[17].nodeValue === '/scrapbook-capture-selected');

  // non-selected elements and resources
  assert(!doc.querySelector('img[src="green.bmp"]'));
  assert(!zip.file("green.bmp"));

  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.file("red.bmp"));

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.file("blue.bmp"));
});

/**
 * A delay time for tab capture is required to wait for favicon loading
 * complete.
 *
 * capturer.captureTab
 * capturer.captureRemote
 */
it('test_capture_headless', async function () {
  /* from tab; source */
  var blob = await capture({
    url: `${localhost}/capture_headless/tab-info.html`,
    mode: "source",
    options: baseOptions,
  }, {delay: 500});

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector(`title`));
  assert(!doc.querySelector(`link[rel~="icon"]`));
  assert(!zip.file("red.bmp"));

  /* from tab; bookmark */
  var blob = await capture({
    url: `${localhost}/capture_headless/tab-info.html`,
    mode: "bookmark",
    options: baseOptions,
  }, {delay: 100});

  var doc = await readFileAsDocument(blob);
  assert(!doc.querySelector(`title`));
  assert(!doc.querySelector(`link[rel~="icon"]`));

  /* from tab frame 0; source */
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

  assert(!doc.querySelector(`title`));
  assert(!doc.querySelector(`link[rel~="icon"]`));
  assert(!zip.file("red.bmp"));

  /* from tab frame 0; bookmark */
  var blob = await capture({
    url: `${localhost}/capture_headless/tab-info.html`,
    frameId: 0,
    mode: "bookmark",
    options: baseOptions,
  }, {delay: 100});

  var doc = await readFileAsDocument(blob);
  assert(!doc.querySelector(`title`));
  assert(!doc.querySelector(`link[rel~="icon"]`));

  /* from URL; source */
  var blob = await captureHeadless({
    url: `${localhost}/capture_headless/tab-info.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector(`title`));
  assert(!doc.querySelector(`link[rel~="icon"]`));
  assert(!zip.file("red.bmp"));

  /* from URL; bookmark */
  var blob = await captureHeadless({
    url: `${localhost}/capture_headless/tab-info.html`,
    mode: "bookmark",
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);
  assert(!doc.querySelector(`title`));
  assert(!doc.querySelector(`link[rel~="icon"]`));
});

/**
 * Capture as file if header content-disposition is attachment.
 *
 * capturer.captureRemote
 */
it('test_capture_headless_attachment', async function () {
  var blob = await captureHeadless({
    url: `${localhost}/capture_headless_attachment/attachment.py`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("red.bmp"));

  var indexFile = zip.file('index.html');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0; url=attachment.html"]'));

  var indexFile = zip.file('attachment.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./red.bmp"]'));

  var blob = await captureHeadless({
    url: `${localhost}/capture_headless_attachment/refresh.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("red.bmp"));

  var indexFile = zip.file('index.html');
  assert(indexFile);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0; url=attachment.html"]'));

  var indexFile = zip.file('attachment.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./red.bmp"]'));
});

/**
 * Check headless captures redirected by a zero-time meta refresh.
 *
 * capturer.captureUrl
 * scrapbook.parseHeaderRefresh
 */
it('test_capture_headless_metaRefresh', async function () {
  /* valid, time = 0 */
  // capture the refreshed page
  var blob = await captureHeadless({
    url: `${localhost}/capture_headless_metaRefresh/time-0.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.body.innerHTML === "refresh target page");

  /* valid, time = 0, url="" */
  // capture the refreshed page
  var result = await captureHeadless({
    url: `${localhost}/capture_headless_metaRefresh/time-0-self.html`,
    options: baseOptions,
  });
  assert(result.error);

  /* valid, time > 0 */
  // rewrite element, capture the original page.
  var blob = await captureHeadless({
    url: `${localhost}/capture_headless_metaRefresh/time-non-0.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('meta[http-equiv]').getAttribute('content') === `1; url=${localhost}/capture_headless_metaRefresh/referred.html`);

  /* invalid */
  // don't rewrite element, capture the original page.
  var blob = await captureHeadless({
    url: `${localhost}/capture_headless_metaRefresh/invalid.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('meta[http-equiv]').getAttribute('content') === "+1 referred.html");
});

/**
 * Check if captureBookmark works
 *
 * capturer.captureBookmark
 */
it('test_capture_bookmark', async function () {
  var blob = await capture({
    url: `${localhost}/capture_bookmark/index.html`,
    mode: "bookmark",
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);

  var html = doc.documentElement;
  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_bookmark/index.html`);
  assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
  assert(html.getAttribute('data-scrapbook-type') === 'bookmark');

  assert(doc.querySelector(`meta[http-equiv="refresh"][content="0; url=${localhost}/capture_bookmark/index.html"]`));
  assert(doc.querySelector(`a[href="${localhost}/capture_bookmark/index.html"]`));
  assert(doc.querySelector(`link[rel="shortcut icon"][href="data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"]`));
});

/**
 * Check meta charset is correctly rewritten
 *
 * capturer.captureDocument
 * capturer.saveDocument
 */
it('test_capture_meta_charset', async function () {
  /* meta new */
  var blob = await capture({
    url: `${localhost}/capture_meta_charset/big5.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.title === 'ABC 中文');

  var metaElems = doc.querySelectorAll('meta');
  assert(metaElems[0].getAttribute('charset') === `UTF-8`);
  assert(metaElems[1].getAttribute('charset') === `GBK`);

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem.getAttribute('src') === `圖片.bmp`);

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem.getAttribute('src') === `圖片.bmp`);

  /* meta old */
  var blob = await capture({
    url: `${localhost}/capture_meta_charset/big5-old.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.title === 'ABC 中文');

  var metaElems = doc.querySelectorAll('meta');
  assert(metaElems[0].getAttribute('content') === `text/html; charset=UTF-8`);
  assert(metaElems[1].getAttribute('content') === `text/html; charset=GBK`);

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem.getAttribute('src') === `圖片.bmp`);

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem.getAttribute('src') === `圖片.bmp`);

  /* meta old (complicated syntax) */
  var blob = await capture({
    url: `${localhost}/capture_meta_charset/big5-old2.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.title === 'ABC 中文');

  var metaElems = doc.querySelectorAll('meta');
  assert(metaElems[0].getAttribute('content') === r`text/javascript; KEY=VALUE`);
  assert(metaElems[1].getAttribute('content') === r`text/plain; charset=UTF-8; data=foo123; data2="中文\"789\""`);
  assert(metaElems[2].getAttribute('content') === r`text/css; CHARSET="GBK"; data=中文123`);

  /* no meta charset; HTTP header Big5 */
  var blob = await capture({
    url: `${localhost}/capture_meta_charset/big5-header.py`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.title === 'ABC 中文');
  assert(doc.querySelector('meta[charset="UTF-8"]'));

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem.getAttribute('src') === `圖片.bmp`);

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem.getAttribute('src') === `圖片.bmp`);
});

/**
 * Check if the URL in a meta refresh is rewritten correctly
 *
 * capturer.captureDocument
 */
it('test_capture_meta_refresh', async function () {
  var blob = await capture({
    url: `${localhost}/capture_meta_refresh/basic.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `30`);
  assert(mrs[1].getAttribute('content') === `30; url=#`);
  assert(mrs[2].getAttribute('content') === `30; url=#123`);
  assert(mrs[3].getAttribute('content') === `30; url=${localhost}/capture_meta_refresh/basic.html?id=123`);
  assert(mrs[4].getAttribute('content') === `30`);
  assert(mrs[5].getAttribute('content') === `30; url=#`);
  assert(mrs[6].getAttribute('content') === `30; url=#123`);
  assert(mrs[7].getAttribute('content') === `30; url=${localhost}/capture_meta_refresh/basic.html?id=123`);
  assert(mrs[8].getAttribute('content') === `20; url=${localhost}/capture_meta_refresh/referred.html`);
  assert(mrs[9].getAttribute('content') === `20; url=${localhost}/capture_meta_refresh/referred.html#`);
  assert(mrs[10].getAttribute('content') === `20; url=${localhost}/capture_meta_refresh/referred.html#123`);
  assert(mrs[11].getAttribute('content') === `20; url=${localhost}/capture_meta_refresh/referred.html?id=123`);
  assert(mrs[12].getAttribute('content') === `15; url=http://example.com/`);
  assert(mrs[13].getAttribute('content') === `15; url=http://example.com/#`);
  assert(mrs[14].getAttribute('content') === `15; url=http://example.com/#123`);
  assert(mrs[15].getAttribute('content') === `15; url=http://example.com/?id=123`);
});

/**
 * Check local selection
 * a meta refresh URL pointing to a not captured part of self page should be resolved to original page
 *
 * capturer.captureDocument
 */
it('test_capture_meta_refresh_selection', async function () {
  /* refresh link target not captured */
  var blob = await capture({
    url: `${localhost}/capture_meta_refresh_selection/delayed21.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `30`);
  assert(mrs[1].getAttribute('content') === `30; url=${localhost}/capture_meta_refresh_selection/delayed21.html#123`);
  assert(mrs[2].getAttribute('content') === `30; url=${localhost}/capture_meta_refresh_selection/delayed21.html?id=123`);
  assert(mrs[3].getAttribute('content') === `30`);
  assert(mrs[4].getAttribute('content') === `30; url=${localhost}/capture_meta_refresh_selection/delayed21.html#123`);
  assert(mrs[5].getAttribute('content') === `30; url=${localhost}/capture_meta_refresh_selection/delayed21.html?id=123`);
  assert(mrs[6].getAttribute('content') === `20; url=${localhost}/capture_meta_refresh_selection/referred.html`);
  assert(mrs[7].getAttribute('content') === `15; url=http://example.com/`);

  /* refresh link target captured */
  var blob = await capture({
    url: `${localhost}/capture_meta_refresh_selection/delayed22.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `30`);
  assert(mrs[1].getAttribute('content') === `30; url=#123`);
  assert(mrs[2].getAttribute('content') === `30; url=${localhost}/capture_meta_refresh_selection/delayed22.html?id=123`);
  assert(mrs[3].getAttribute('content') === `30`);
  assert(mrs[4].getAttribute('content') === `30; url=#123`);
  assert(mrs[5].getAttribute('content') === `30; url=${localhost}/capture_meta_refresh_selection/delayed22.html?id=123`);
  assert(mrs[6].getAttribute('content') === `20; url=${localhost}/capture_meta_refresh_selection/referred.html`);
  assert(mrs[7].getAttribute('content') === `15; url=http://example.com/`);
});

/**
 * Check when base is set to another page
 *
 * capturer.captureDocument
 */
it('test_capture_meta_refresh_base', async function () {
  // time = 0 (capture the redirected page)
  var blob = await captureHeadless({
    url: `${localhost}/capture_meta_refresh_base/refresh0.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector(`html[data-scrapbook-source="${localhost}/capture_meta_refresh_base/subdir/target.html?id=123#456"]`));

  // time = 1 (capture the meta refresh page)
  var blob = await captureHeadless({
    url: `${localhost}/capture_meta_refresh_base/refresh1.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `1; url=${localhost}/capture_meta_refresh_base/subdir/target.html?id=123#456`);
});

/**
 * Check meta refresh resolve for source/bookmark.
 *
 * capturer.captureDocument
 */
it('test_capture_meta_refresh_mode', async function () {
  /* source */
  var blob = await captureHeadless({
    url: `${localhost}/capture_meta_refresh_mode/refresh.html`,
    mode: 'source',
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_meta_refresh_mode/target.html#abc`);

  /* bookmark */
  var blob = await captureHeadless({
    url: `${localhost}/capture_meta_refresh_mode/refresh.html`,
    mode: 'bookmark',
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_meta_refresh_mode/target.html#abc`);
});

/**
 * Check meta refresh resolve to file for source/bookmark.
 *
 * capturer.captureDocument
 */
it('test_capture_meta_refresh_mode_file', async function () {
  /* source */
  var blob = await captureHeadless({
    url: `${localhost}/capture_meta_refresh_mode_file/refresh.html`,
    mode: 'source',
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_meta_refresh_mode_file/target.txt#abc`);

  /* bookmark */
  var blob = await captureHeadless({
    url: `${localhost}/capture_meta_refresh_mode_file/refresh.html`,
    mode: 'bookmark',
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_meta_refresh_mode_file/target.txt#abc`);
});

/**
 * Meta refresh in <noscript> should be ignored.
 *
 * capturer.captureDocument
 */
it('test_capture_meta_refresh_noscript', async function () {
  /* source */
  var blob = await captureHeadless({
    url: `${localhost}/capture_meta_refresh_noscript/refresh.html`,
    mode: 'source',
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_meta_refresh_noscript/refresh.html`);

  /* bookmark */
  var blob = await captureHeadless({
    url: `${localhost}/capture_meta_refresh_noscript/refresh.html`,
    mode: 'bookmark',
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_meta_refresh_noscript/refresh.html`);
});

/**
 * Check if option works
 *
 * capture.contentSecurityPolicy
 */
it('test_capture_meta_csp', async function () {
  /* capture.contentSecurityPolicy = save */
  var options = {
    "capture.contentSecurityPolicy": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_meta_csp/csp.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('meta[http-equiv]').getAttribute('content') === `default-src 'nonce-2726c7f26c';`);
  assert(doc.querySelector('link').getAttribute('nonce') === `2726c7f26c`);
  assert(doc.querySelector('style').getAttribute('nonce') === `2726c7f26c`);
  assert(doc.querySelector('script[src]').getAttribute('nonce') === `2726c7f26c`);
  assert(doc.querySelector('script:not([src])').getAttribute('nonce') === `2726c7f26c`);

  /* capture.contentSecurityPolicy = remove */
  var options = {
    "capture.contentSecurityPolicy": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_meta_csp/csp.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('meta[http-equiv]'));
  assert(!doc.querySelector('link').hasAttribute('nonce'));
  assert(!doc.querySelector('style').hasAttribute('nonce'));
  assert(!doc.querySelector('script[src]').hasAttribute('nonce'));
  assert(!doc.querySelector('script:not([src])').hasAttribute('nonce'));
});

/**
 * Check meta in a shadowRoot is ignored.
 *
 * capturer.captureDocument
 */
it('test_capture_meta_shadow', async function () {
  var blob = await capture({
    url: `${localhost}/capture_meta_shadow/meta.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // a default meta[charset] should be generated
  assert(doc.querySelector('meta[charset="UTF-8"]:not([http-equiv]):not([content])'));

  var host = doc.querySelector('[data-scrapbook-shadowdom]');
  assert(host.getAttribute("data-scrapbook-shadowdom").trim() === `\
<meta charset="Big5">
<meta http-equiv="content-type" content="text/html; charset=Big5">
<meta http-equiv="Content-Security-Policy" content="default-src 'nonce-2726c7f26c';">
<meta http-equiv="refresh" content="0; url=nonexist.html">`);
});

/**
 * Check if option works
 *
 * capture.base
 */
it('test_capture_base', async function () {
  /* capture.base = save */
  var options = {
    "capture.base": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_base/base.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var bases = doc.querySelectorAll('base');
  assert(bases[0].getAttribute('href') === `http://example.com/`);
  assert(bases[0].getAttribute('target') === `_blank`);
  assert(bases[1].getAttribute('href') === `${localhost}/capture_base/subdir/dummy.html`);

  /* capture.base = blank */
  var options = {
    "capture.base": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_base/base.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var bases = doc.querySelectorAll('base');
  assert(!bases[0].hasAttribute('href'));
  assert(bases[0].getAttribute('target') === `_blank`);
  assert(!bases[1].hasAttribute('href'));

  /* capture.base = remove */
  var options = {
    "capture.base": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_base/base.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var bases = doc.querySelectorAll('base');
  assert(!bases.length);
});

/**
 * Check if the URL for general saved resource is rewritten correctly
 * when base is set to another directory.
 *
 * We take image for instance, and other resources should work same
 * since they share same implementation.
 *
 * capturer.resolveRelativeUrl
 * capturer.captureDocument
 */
it('test_capture_base_rewrite', async function () {
  var blob = await capture({
    url: `${localhost}/capture_base_rewrite/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("green.bmp"));
  assert(zip.file("yellow.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('img').getAttribute('src') === `green.bmp`);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `green.bmp 1x, yellow.bmp 2x`);
});

/**
 * Check for "", hash, search,
 * and URL pointing to main html page (a bad case)
 *
 * capturer.resolveRelativeUrl
 * capturer.captureDocument
 */
it('test_capture_base_rewrite_special', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  var blob = await capture({
    url: `${localhost}/capture_base_rewrite_special/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index-1.html"));
  assert(zip.file("index-2.html"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === ``);
  assert(imgs[1].getAttribute('src') === `#123`);
  assert(imgs[2].getAttribute('src') === `index-1.html`); // html page saved as img
  assert(imgs[3].getAttribute('src') === `index-2.html`); // html page saved as img
});

/**
 * Check if URLs after base[href] are handled correctly.
 */
it('test_capture_base_dynamic', async function () {
  for (const base of ["save", "blank", "remove"]) {
    console.debug("capture.base = %s", base);

    var options = {
      "capture.base": base,
    };
    var blob = await capture({
      url: `${localhost}/capture_base_dynamic/basic.html`,
      options: Object.assign({}, baseOptions, options),
    });

    var zip = await new JSZip().loadAsync(blob);

    var indexFile = zip.file('index.html');
    var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
    var doc = await readFileAsDocument(indexBlob);

    assert(doc.querySelector('img[src]').getAttribute('src') === `img_src.py`);
    assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `img_srcset.py 2x`);
    assert(doc.querySelector('picture source').getAttribute('srcset') === `picture_source.py`);
    assert(doc.querySelector('input[type="image"]').getAttribute('src') === `input_image.py`);
    assert(doc.querySelector('table').getAttribute('background') === `table_background.py`);

    assert(doc.querySelector('a').getAttribute('href') === `${localhost}/capture_base_dynamic/resources/anchor.py`);
    assert(doc.querySelector('q').getAttribute('cite') === `${localhost}/capture_base_dynamic/resources/q.py`);

    var file = zip.file('img_src.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/basic.html`);

    var file = zip.file('img_srcset.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/basic.html`);

    var file = zip.file('picture_source.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/basic.html`);

    var file = zip.file('input_image.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/basic.html`);

    var file = zip.file('table_background.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/basic.html`);
  }
});

/**
 * Check if URLs before base[href] are handled correctly.
 */
it('test_capture_base_dynamic_bad', async function () {
  for (const base of ["save", "blank", "remove"]) {
    console.debug("capture.base = %s", base);

    var options = {
      "capture.base": base,
    };
    var blob = await capture({
      url: `${localhost}/capture_base_dynamic/bad.html`,
      options: Object.assign({}, baseOptions, options),
    });

    var zip = await new JSZip().loadAsync(blob);

    var indexFile = zip.file('index.html');
    var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
    var doc = await readFileAsDocument(indexBlob);

    assert(doc.querySelector('img[src]').getAttribute('src') === `img_src.py`);
    assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `img_srcset.py 2x`);
    assert(doc.querySelector('picture source').getAttribute('srcset') === `picture_source.py`);
    assert(doc.querySelector('input[type="image"]').getAttribute('src') === `input_image.py`);
    assert(doc.querySelector('table').getAttribute('background') === `table_background.py`);

    assert(doc.querySelector('a').getAttribute('href') === `${localhost}/capture_base_dynamic/resources/resources/anchor.py`);
    assert(doc.querySelector('q').getAttribute('cite') === `${localhost}/capture_base_dynamic/resources/resources/q.py`);

    var file = zip.file('img_src.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/bad.html`);

    var file = zip.file('img_srcset.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/bad.html`);

    var file = zip.file('picture_source.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/bad.html`);

    var file = zip.file('input_image.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/bad.html`);

    var file = zip.file('table_background.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_base_dynamic/bad.html`);
  }
});

/**
 * Check if CSS-related URLs after base[href] are handled correctly.
 */
$it.xfailIf(
  userAgent.is('chromium') && userAgent.major < 96,
  'referrer for an imported CSS is erroneously set to document base in Chromium < 96',
)('test_capture_base_dynamic_css', async function () {
  for (const rewriteCss of ["url", "tidy", "match"]) {
    for (const styleRes of ["save", "save-used"]) {
      console.debug("capture.rewriteCss = %s, capture.imageBackground = capture.font = %s", rewriteCss, styleRes);

      var options = {
        "capture.rewriteCss": rewriteCss,
        "capture.imageBackground": styleRes,
        "capture.font": styleRes,
      };
      var blob = await capture({
        url: `${localhost}/capture_base_dynamic_css/basic.html`,
        options: Object.assign({}, baseOptions, options),
      });
      var zip = await new JSZip().loadAsync(blob);

      var file = zip.file('link.py.css');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text.match(
        cssRegex`:root { --referrer: "${escapeRegExp(localhost)}/capture_base_dynamic_css/basic.html"; }
@font-face { font-family: linkFont; src: url("link_font.py"); }
#link-font { font-family: linkFont; }
#link-bg { background-image: url("link_bg.py"); }`
      ));

      var file = zip.file('link_font.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/resources/link.py`);

      var file = zip.file('link_bg.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/resources/link.py`);

      var file = zip.file('style_import.py.css');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text.match(
        cssRegex`:root { --referrer: "${escapeRegExp(localhost)}/capture_base_dynamic_css/basic.html"; }
@font-face { font-family: styleImportFont; src: url("style_import_font.py"); }
#style-import-font { font-family: styleImportFont; }
#style-import-bg { background-image: url("style_import_bg.py"); }`
      ));

      var file = zip.file('style_import_font.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/resources/style_import.py`);

      var file = zip.file('style_import_bg.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/resources/style_import.py`);

      var file = zip.file('style_font.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/basic.html`);

      var file = zip.file('style_bg.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/basic.html`);

      var file = zip.file('inline.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/basic.html`);
    }
  }
});

/**
 * Check if CSS-related URLs before base[href] are handled correctly.
 */
$it.xfailIf(
  userAgent.is('chromium') && userAgent.major < 96,
  'referrer for an imported CSS is erroneously set to document base in Chromium < 96',
)('test_capture_base_dynamic_css_bad', async function () {
  for (const rewriteCss of ["url", "tidy", "match"]) {
    for (const styleRes of ["save", "save-used"]) {
      console.debug("capture.rewriteCss = %s, capture.imageBackground = capture.font = %s", rewriteCss, styleRes);

      var options = {
        "capture.rewriteCss": rewriteCss,
        "capture.imageBackground": styleRes,
        "capture.font": styleRes,
      };
      var blob = await capture({
        url: `${localhost}/capture_base_dynamic_css/bad.html`,
        options: Object.assign({}, baseOptions, options),
      });
      var zip = await new JSZip().loadAsync(blob);

      var file = zip.file('link.py.css');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text.match(
        cssRegex`:root { --referrer: "${escapeRegExp(localhost)}/capture_base_dynamic_css/bad.html"; }
@font-face { font-family: linkFont; src: url("link_font.py"); }
#link-font { font-family: linkFont; }
#link-bg { background-image: url("link_bg.py"); }`
      ));

      var file = zip.file('link_font.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/resources/link.py`);

      var file = zip.file('link_bg.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/resources/link.py`);

      var file = zip.file('style_import.py.css');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text.match(
        cssRegex`:root { --referrer: "${escapeRegExp(localhost)}/capture_base_dynamic_css/bad.html"; }
@font-face { font-family: styleImportFont; src: url("style_import_font.py"); }
#style-import-font { font-family: styleImportFont; }
#style-import-bg { background-image: url("style_import_bg.py"); }`
      ));

      var file = zip.file('style_import_font.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/resources/style_import.py`);

      var file = zip.file('style_import_bg.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/resources/style_import.py`);

      var file = zip.file('style_font.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/bad.html`);

      var file = zip.file('style_bg.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/bad.html`);

      var file = zip.file('inline.py');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `${localhost}/capture_base_dynamic_css/bad.html`);
    }
  }
});

/**
 * Check if frame-related URLs after base[href] are handled correctly.
 */
it('test_capture_base_dynamic_frame', async function () {
  for (const func of ["capture", "captureHeadless"]) {
    console.debug("func = %s", func);

    /* capture.frame = save */
    var options = {
      "capture.base": "blank",
      "capture.frame": "save",
    };
    var blob = await global[func]({
      url: `${localhost}/capture_base_dynamic_frame/srcdoc_basic.html`,
      options: Object.assign({}, baseOptions, options),
    });

    var zip = await new JSZip().loadAsync(blob);

    var indexFile = zip.file('index_1.html');
    var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
    var doc = await readFileAsDocument(indexBlob);
    assert(doc.querySelector('img').getAttribute('src') === `img_src.py.svg`);

    var file = zip.file('img_src.py.svg');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `\
<!-- referrer: ${localhost}/capture_base_dynamic_frame/srcdoc_basic.html -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>`);

    var indexFile = zip.file('index_2.html');
    var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
    var doc = await readFileAsDocument(indexBlob);
    assert(doc.querySelector('link').getAttribute('href') === `link.py.css`);

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
      assert(text === `:root { --referrer: "${localhost}/" }`);
    }

    /* capture.frame = link */
    var options = {
      "capture.base": "blank",
      "capture.frame": "link",
    };
    var blob = await global[func]({
      url: `${localhost}/capture_base_dynamic_frame/srcdoc_basic.html`,
      options: Object.assign({}, baseOptions, options),
    });

    var zip = await new JSZip().loadAsync(blob);

    var indexFile = zip.file('index.html');
    var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
    var doc = await readFileAsDocument(indexBlob);

    var frame = doc.querySelector('iframe');
    var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
    var srcdoc = await readFileAsDocument(srcdocBlob);
    var text = decodeURIComponent(srcdoc.querySelector('img').getAttribute('src'));
    assert(text === `data:image/svg+xml;filename=img_src.py.svg,\
<!-- referrer: ${localhost}/capture_base_dynamic_frame/srcdoc_basic.html -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>`);

    // see above save case
    if (func === "captureHeadless") {
      var frame = doc.querySelectorAll('iframe')[1];
      var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
      var srcdoc = await readFileAsDocument(srcdocBlob);
      var text = decodeURIComponent(srcdoc.querySelector('link').getAttribute('href'));
      assert(text === `data:text/css;charset=UTF-8;filename=link.py.css,:root { --referrer: "${localhost}/" }`);
    }
  }
});

/**
 * Check if frame-related URLs before base[href] are handled correctly.
 */
it('test_capture_base_dynamic_frame_bad', async function () {
  for (const func of ["capture", "captureHeadless"]) {
    console.debug("func = %s", func);

    /* capture.frame = save */
    var options = {
      "capture.base": "blank",
      "capture.frame": "save",
    };
    var blob = await global[func]({
      url: `${localhost}/capture_base_dynamic_frame/srcdoc_bad.html`,
      options: Object.assign({}, baseOptions, options),
    });

    var zip = await new JSZip().loadAsync(blob);

    var indexFile = zip.file('index_1.html');
    var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
    var doc = await readFileAsDocument(indexBlob);
    assert(doc.querySelector('img').getAttribute('src') === `img_src.py.svg`);

    var file = zip.file('img_src.py.svg');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `\
<!-- referrer: ${localhost}/capture_base_dynamic_frame/srcdoc_bad.html -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>`);

    // see above save case for test_capture_base_dynamic_frame
    if (func === "captureHeadless") {
      var file = zip.file('link.py.css');
      var text = (await readFileAsText(await file.async('blob'))).trim();
      assert(text === `:root { --referrer: "${localhost}/" }`);
    }

    /* capture.frame = link */
    var options = {
      "capture.base": "blank",
      "capture.frame": "link",
    };
    var blob = await global[func]({
      url: `${localhost}/capture_base_dynamic_frame/srcdoc_bad.html`,
      options: Object.assign({}, baseOptions, options),
    });

    var zip = await new JSZip().loadAsync(blob);

    var indexFile = zip.file('index.html');
    var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
    var doc = await readFileAsDocument(indexBlob);

    var frame = doc.querySelector('iframe');
    var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
    var srcdoc = await readFileAsDocument(srcdocBlob);
    var text = decodeURIComponent(srcdoc.querySelector('img').getAttribute('src'));
    assert(text === `data:image/svg+xml;filename=img_src.py.svg,\
<!-- referrer: ${localhost}/capture_base_dynamic_frame/srcdoc_bad.html -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>`);

    // see above save case for test_capture_base_dynamic_frame
    if (func === "captureHeadless") {
      var frame = doc.querySelectorAll('iframe')[1];
      var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
      var srcdoc = await readFileAsDocument(srcdocBlob);
      var text = decodeURIComponent(srcdoc.querySelector('link').getAttribute('href'));
      assert(text === `data:text/css;charset=UTF-8;filename=link.py.css,:root { --referrer: "${localhost}/" }`);
    }
  }
});

/**
 * Handle base[href] change after resources have been loaded.
 *
 * - Seems impossible to get the real source URL of the resources before src
 *   etc. has beeen changed.
 *
 * capture.base
 */
$it.xfail()('test_capture_base_dynamic_scripted', async function () {
  var options = {
    "capture.base": "blank",
  };

  /* capture (source) */
  var blob = await capture({
    url: `${localhost}/capture_base_dynamic_scripted/base.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var imgFile = zip.file('img.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA');  // green

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img').getAttribute('src') === "img.bmp");

  /* capture (tab) */
  var blob = await capture({
    url: `${localhost}/capture_base_dynamic_scripted/base.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var imgFile = zip.file('img.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA');  // green

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img').getAttribute('src') === "img.bmp");
});

/**
 * Check if option works
 *
 * capture.favicon
 */
it('test_capture_favicon', async function () {
  /* capture.favicon = save */
  var options = {
    "capture.favicon": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_favicon/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('red.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElem = doc.querySelector('link[rel~="icon"]');
  assert(iconElem.getAttribute('href') === `red.bmp`);

  /* capture.favicon = link */
  var options = {
    "capture.favicon": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_favicon/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElem = doc.querySelector('link[rel~="icon"]');
  assert(iconElem.getAttribute('href') === `${localhost}/capture_favicon/red.bmp`);

  /* capture.favicon = blank */
  var options = {
    "capture.favicon": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_favicon/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElem = doc.querySelector('link[rel~="icon"]');
  assert(!iconElem.hasAttribute('href'));

  /* capture.favicon = remove */
  var options = {
    "capture.favicon": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_favicon/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElem = doc.querySelector('link[rel~="icon"]');
  assert(!iconElem);
});

it('test_capture_favicon_bookmark', async function () {
  /* capture.favicon = save */
  var options = {
    "capture.favicon": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_favicon/favicon.html`,
    mode: "bookmark",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assertEqual(
    doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'),
    'data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA'
  );

  /* capture.favicon = link */
  var options = {
    "capture.favicon": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_favicon/favicon.html`,
    mode: "bookmark",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assert(!doc.querySelector('link[rel~="icon"]'));

  /* capture.favicon = blank */
  var options = {
    "capture.favicon": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_favicon/favicon.html`,
    mode: "bookmark",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assert(!doc.querySelector('link[rel~="icon"]'));

  /* capture.favicon = remove */
  var options = {
    "capture.favicon": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_favicon/favicon.html`,
    mode: "bookmark",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assert(!doc.querySelector('link[rel~="icon"]'));
});

/**
 * Check if option works
 *
 * capture.faviconAttrs
 */
it('test_capture_faviconAttrs', async function () {
  /* capture.faviconAttrs = "apple-touch-icon apple-touch-icon-precomposed" */
  var options = {
    "capture.favicon": "save",
    "capture.faviconAttrs": "apple-touch-icon apple-touch-icon-precomposed",
  };
  var blob = await capture({
    url: `${localhost}/capture_faviconAttrs/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('red.bmp'));
  assert(zip.file('yellow.bmp'));
  assert(zip.file('green.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElems = doc.querySelectorAll('link[rel]');
  assert(iconElems[0].getAttribute('href') === `red.bmp`);
  assert(iconElems[1].getAttribute('href') === `yellow.bmp`);
  assert(iconElems[2].getAttribute('href') === `green.bmp`);

  /* capture.faviconAttrs = "apple-touch-icon" */
  var options = {
    "capture.favicon": "save",
    "capture.faviconAttrs": "apple-touch-icon",
  };
  var blob = await capture({
    url: `${localhost}/capture_faviconAttrs/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('red.bmp'));
  assert(zip.file('yellow.bmp'));
  assert(!zip.file('green.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElems = doc.querySelectorAll('link[rel]');
  assert(iconElems[0].getAttribute('href') === `red.bmp`);
  assert(iconElems[1].getAttribute('href') === `yellow.bmp`);
  assert(iconElems[2].getAttribute('href') === `${localhost}/capture_faviconAttrs/green.bmp`);

  /* capture.faviconAttrs = "" */
  var options = {
    "capture.favicon": "save",
    "capture.faviconAttrs": "",
  };
  var blob = await capture({
    url: `${localhost}/capture_faviconAttrs/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('red.bmp'));
  assert(!zip.file('yellow.bmp'));
  assert(!zip.file('green.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElems = doc.querySelectorAll('link[rel]');
  assert(iconElems[0].getAttribute('href') === `red.bmp`);
  assert(iconElems[1].getAttribute('href') === `${localhost}/capture_faviconAttrs/yellow.bmp`);
  assert(iconElems[2].getAttribute('href') === `${localhost}/capture_faviconAttrs/green.bmp`);
});

/**
 * Check if option works
 *
 * capture.style
 * capturer.captureDocument
 */
it('test_capture_css_style', async function () {
  /* capture.style = save */
  var options = {
    "capture.style": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_style/style.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("external.css"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `#internal { background: yellow; }`);
  assert(doc.querySelector('link').getAttribute('href') === `external.css`);

  var cssFile = zip.file('external.css');
  var text = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(text === `#external { background: yellow; }`);

  /* capture.style = link */
  var options = {
    "capture.style": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_style/style.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `#internal { background: yellow; }`);
  assert(doc.querySelector('link').getAttribute('href') === `${localhost}/capture_css_style/external.css`);

  /* capture.style = blank */
  var options = {
    "capture.style": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_style/style.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === ``);
  assert(!doc.querySelector('link').hasAttribute('href'));

  /* capture.style = remove */
  var options = {
    "capture.style": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_style/style.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('style'));
  assert(!doc.querySelector('link'));
});

/**
 * Check if option works
 *
 * capture.styleInline
 * capturer.captureDocument
 */
it('test_capture_css_styleInline', async function () {
  var options = {
    "capture.style": "remove",
  };

  /* capture.styleInline = save */
  options["capture.styleInline"] = "save";

  var blob = await capture({
    url: `${localhost}/capture_css_styleInline/styleInline.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("green.bmp"));
  assert(!zip.file("font.woff"));
  assert(!zip.file("import.css"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var elems = doc.querySelectorAll('blockquote');
  assert(elems[0].getAttribute('style') === `background: yellow;`);
  assert(elems[1].getAttribute('style') === `background: url("green.bmp");`);
  assert(elems[2].getAttribute('style') === `@font-face { font-family: myFont; src: url("./font.woff"); }`);
  assert(elems[3].getAttribute('style') === `@import "./import.css";`);

  /* capture.styleInline = blank */
  options["capture.styleInline"] = "blank";

  var blob = await capture({
    url: `${localhost}/capture_css_styleInline/styleInline.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var elems = doc.querySelectorAll('blockquote');
  assert(elems[0].getAttribute('style') === ``);
  assert(elems[1].getAttribute('style') === ``);
  assert(elems[2].getAttribute('style') === ``);
  assert(elems[3].getAttribute('style') === ``);

  /* capture.styleInline = remove */
  options["capture.styleInline"] = "remove";

  var blob = await capture({
    url: `${localhost}/capture_css_styleInline/styleInline.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var elems = doc.querySelectorAll('blockquote');
  assert(!elems[0].hasAttribute('style'));
  assert(!elems[1].hasAttribute('style'));
  assert(!elems[2].hasAttribute('style'));
  assert(!elems[3].hasAttribute('style'));
});

/**
 * Save as-is when default (persistent and preferred) stylesheets are picked.
 *
 * capturer.captureDocument
 * capturer.DocumentCssHandler.isBrowserPick
 */
it('test_capture_css_disabled_default', async function () {
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
  assert(styleElem.textContent.trim() === `#internal { background: yellow; }`);

  assert(zip.file("persistent.css"));
  assert(zip.file("default.css"));
  assert(zip.file("default2.css"));
  assert(zip.file("alternative.css"));
  assert(zip.file("alternative2.css"));
});

/**
 * Save as-is when an alternative stylesheets group is picked.
 *
 * capturer.captureDocument
 * capturer.DocumentCssHandler.isBrowserPick
 */
$it.xfailIf(
  userAgent.is('chromium'),
  'browser pick of alternative stylesheet is not supported in Chromium',
)('test_capture_css_disabled_picked', async function () {
  var blob = await capture({
    url: `${localhost}/capture_css_disabled/picked.html`,
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
  assert(styleElem.textContent.trim() === `#internal { background: yellow; }`);

  assert(zip.file("persistent.css"));
  assert(zip.file("default.css"));
  assert(zip.file("default2.css"));
  assert(zip.file("alternative.css"));
  assert(zip.file("alternative2.css"));
});

/**
 * Save enabled stylesheets and all alternative stylesheets in Chromium.
 *
 * Chromium has a bug that the disabled propery of an alternative stylesheet
 * is always false, although they are actually not applied. Save all
 * alternative stylesheets as the fallback behavior for better cross-platform
 * interoperability.
 *
 * ref: https://issues.chromium.org/issues/41460238
 *
 * capturer.captureDocument
 * capturer.DocumentCssHandler.isBrowserPick
 */
$it.skipIf(
  !userAgent.is('chromium'),
)('test_capture_css_disabled_picked_chromium', async function () {
  var blob = await capture({
    url: `${localhost}/capture_css_disabled/picked.html`,
    options: baseOptions,
  }, {delay: 100});
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
  assert(styleElem.textContent.trim() === `#internal { background: yellow; }`);

  assert(zip.file("persistent.css"));
  assert(!zip.file("default.css"));
  assert(!zip.file("default2.css"));
  assert(zip.file("alternative.css"));
  assert(zip.file("alternative2.css"));
});

/**
 * Mark and skip saving disabled stylesheets when picked by scripts.
 *
 * capturer.captureDocument
 * capturer.DocumentCssHandler.isBrowserPick
 */
$it.xfailIf(
  userAgent.is('chromium'),
  'disabled property of an alternative stylesheet is misleading in Chromium',
)('test_capture_css_disabled_scripted', async function () {
  var blob = await capture({
    url: `${localhost}/capture_css_disabled/scripted1.html`,
    options: baseOptions,
  }, {delay: 100});
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
  assert(styleElem.textContent.trim() === `#internal { background: yellow; }`);

  assert(zip.file("persistent.css"));
  assert(zip.file("default.css"));
  assert(!zip.file("default2.css"));
  assert(zip.file("alternative.css"));
  assert(!zip.file("alternative2.css"));

  var blob = await capture({
    url: `${localhost}/capture_css_disabled/scripted2.html`,
    options: baseOptions,
  }, {delay: 100});
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElem = doc.querySelector('link[rel~="stylesheet"]');
  assert(styleElem.matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
  var styleElem = doc.querySelector('style');
  assert(styleElem.matches('[data-scrapbook-css-disabled]'));
  assert(styleElem.textContent.trim() === ``);

  assert(!zip.file("persistent.css"));
});

/**
 * Save enabled stylesheets and all alternative stylesheets in Chromium.
 *
 * see also: case test_capture_css_disabled_picked_chromium
 *
 * capturer.captureDocument
 * capturer.DocumentCssHandler.isBrowserPick
 */
$it.skipIf(
  !userAgent.is('chromium'),
)('test_capture_css_disabled_scripted_chromium', async function () {
  var blob = await capture({
    url: `${localhost}/capture_css_disabled/scripted1.html`,
    options: baseOptions,
  }, {delay: 100});
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
  assert(styleElem.textContent.trim() === `#internal { background: yellow; }`);

  assert(zip.file("persistent.css"));
  assert(zip.file("default.css"));
  assert(!zip.file("default2.css"));
  assert(zip.file("alternative.css"));
  assert(zip.file("alternative2.css"));

  var blob = await capture({
    url: `${localhost}/capture_css_disabled/scripted2.html`,
    options: baseOptions,
  }, {delay: 100});
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElem = doc.querySelector('link[rel~="stylesheet"]');
  assert(styleElem.matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
  var styleElem = doc.querySelector('style');
  assert(styleElem.matches('[data-scrapbook-css-disabled]'));
  assert(styleElem.textContent.trim() === ``);

  assert(!zip.file("persistent.css"));
});

/**
 * Check if option works
 *
 * capture.rewriteCss
 * capturer.DocumentCssHandler
 */
it('test_capture_css_rewriteCss', async function () {
  /* capture.rewriteCss = url */
  var options = {
    "capture.rewriteCss": "url",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("imported.css"));
  assert(zip.file("sansation_light.woff"));
  assert(zip.file("green.bmp"));
  assert(zip.file("unsupported-1.bmp"));
  assert(zip.file("unsupported-2.bmp"));
  assert(zip.file("unsupported-3.bmp"));
  assert(zip.file("unsupported-4.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `\
@import "imported.css";
@font-face { font-family: fontface; src: url("sansation_light.woff"); }
#background { background: url("green.bmp"); }`);

  assert(styleElems[1].textContent.trim() === `\
@media print {
  #media { color: green; }
}`);

  assert(styleElems[2].textContent.trim() === `\
@keyframes demo {
  from { transform: translateX(-5px); }
  to { transform: translateX(40px); }
}
#keyframes { animation: demo 3s linear infinite; }`);

  assert(styleElems[3].textContent.trim() === `\
@supports (--myvar: green) {
  :root {
    --myvar: green;
  }
  #supports {
    color: var(--myvar);
  }
}`);

  assert(styleElems[4].textContent.trim() === `\
@namespace svg url(http://www.w3.org/2000/svg);
svg|a text, text svg|a {
  fill: blue;
  text-decoration: underline;
}`);

  assert(styleElems[5].textContent.trim() === `\
/* unsupported rules */
#unsupported {
  *background: url("unsupported-1.bmp"); /* IE7 */
  _background: url("unsupported-2.bmp"); /* IE6 */
  -o-background: url("unsupported-3.bmp"); /* vandor prefix */
  unknown: url("unsupported-4.bmp"); /* unknown */
}`);

  assert(doc.querySelector('blockquote').getAttribute('style') === `\
background: blue; background: url("green.bmp");`);

  /* capture.rewriteCss = tidy */
  var options = {
    "capture.rewriteCss": "tidy",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("imported.css"));
  assert(zip.file("sansation_light.woff"));
  assert(zip.file("green.bmp"));
  assert(!zip.file("unsupported-1.bmp"));
  assert(!zip.file("unsupported-2.bmp"));
  assert(!zip.file("unsupported-3.bmp"));
  assert(!zip.file("unsupported-4.bmp"));

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

  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("imported.css"));
  assert(zip.file("sansation_light.woff"));
  assert(zip.file("green.bmp"));
  assert(!zip.file("unsupported-1.bmp"));
  assert(!zip.file("unsupported-2.bmp"));
  assert(!zip.file("unsupported-3.bmp"));
  assert(!zip.file("unsupported-4.bmp"));

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

  /* capture.rewriteCss = none */
  var options = {
    "capture.rewriteCss": "none",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `\
@import "rewrite/imported.css";
@font-face { font-family: fontface; src: url(rewrite/sansation_light.woff); }
#background { background: url(rewrite/green.bmp); }`);

  assert(styleElems[1].textContent.trim() === `\
@media print {
  #media { color: green; }
}`);

  assert(styleElems[2].textContent.trim() === `\
@keyframes demo {
  from { transform: translateX(-5px); }
  to { transform: translateX(40px); }
}
#keyframes { animation: demo 3s linear infinite; }`);

  assert(styleElems[3].textContent.trim() === `\
@supports (--myvar: green) {
  :root {
    --myvar: green;
  }
  #supports {
    color: var(--myvar);
  }
}`);

  assert(styleElems[4].textContent.trim() === `\
@namespace svg url(http://www.w3.org/2000/svg);
svg|a text, text svg|a {
  fill: blue;
  text-decoration: underline;
}`);

  assert(styleElems[5].textContent.trim() === `\
/* unsupported rules */
#unsupported {
  *background: url(rewrite/unsupported-1.bmp); /* IE7 */
  _background: url(rewrite/unsupported-2.bmp); /* IE6 */
  -o-background: url(rewrite/unsupported-3.bmp); /* vandor prefix */
  unknown: url(rewrite/unsupported-4.bmp); /* unknown */
}`);

  assert(doc.querySelector('blockquote').getAttribute('style') === `\
background: blue; background: url(rewrite/green.bmp);`);
});

/**
 * Check if namsepaced element selector is reasonably handled.
 */
it('test_capture_css_rewriteCss_namespace_element', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_namespace/element.xhtml`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.xhtml');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  assertEqual(styleElems[0].textContent.trim(), `\
@namespace myns url("http://example.com/myns");
myns|elem-1 { background-color: lime; }`);

  assertEqual(styleElems[1].textContent.trim(), `\
@namespace url("http://example.com/myns");
elem-2 { background-color: lime; }`);

  assertEqual(styleElems[2].textContent.trim(), `\
@namespace myns url("http://example.com/myns");
myns|elem-3 { background-color: lime; }`);

  assertEqual(styleElems[3].textContent.trim(), `\
@namespace url("http://example.com/myns");
elem-4 { background-color: lime; }`);

  assertEqual(styleElems[4].textContent.trim(), `\
@namespace myns url("http://example.com/myns");`);

  assertEqual(styleElems[5].textContent.trim(), `\
@namespace url("http://example.com/myns");`);
});

/**
 * Check if namsepaced attribute selector is reasonably handled.
 */
it('test_capture_css_rewriteCss_namespace_attribute', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_namespace/attribute.xhtml`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.xhtml');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  assertEqual(styleElems[0].textContent.trim(), `\
@namespace myns url("http://example.com/myns");
[myns|attr1] { background-color: lime; }`);

  assertEqual(styleElems[1].textContent.trim(), `\
@namespace url("http://example.com/myns");
[attr2] { background-color: lime; }`);

  assertEqual(styleElems[2].textContent.trim(), `\
@namespace myns url("http://example.com/myns");
[myns|attr3] { background-color: lime; }`);

  assertEqual(styleElems[3].textContent.trim(), `\
@namespace url("http://example.com/myns");
[attr4] { background-color: lime; }`);

  assertEqual(styleElems[4].textContent.trim(), `\
@namespace myns url("http://example.com/myns");`);

  assertEqual(styleElems[5].textContent.trim(), `\
@namespace url("http://example.com/myns");`);
});

/**
 * Check if option works for @supports.
 *
 * capture.rewriteCss
 * capturer.DocumentCssHandler
 */
it('test_capture_css_rewriteCss_at_supports', async function () {
  /* capture.rewriteCss = url */
  var options = {
    "capture.rewriteCss": "url",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_at_supports/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[1].textContent.trim() === `\
@supports (display: block) {
  #case1 {
    background-image: url("case1.bmp");
  }
}`
  );

  assert(styleElems[2].textContent.trim() === `\
@supports (display: nonexist) {
  #case2 {
    background-image: url("case2.bmp");
  }
}`
  );

  /* capture.rewriteCss = tidy */
  var options = {
    "capture.rewriteCss": "tidy",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_at_supports/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[1].textContent.trim().match(
    cssRegex`@supports (display: block) {
  #case1 { background-image: url("case1.bmp"); }
}`
  ));

  assert(styleElems[2].textContent.trim().match(
    cssRegex`@supports (display: nonexist) {
  #case2 { background-image: url("case2.bmp"); }
}`
  ));

  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_at_supports/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[1].textContent.trim().match(
    cssRegex`@supports (display: block) {
  #case1 { background-image: url("case1.bmp"); }
}`
  ));

  assert(styleElems[2].textContent.trim().match(
    cssRegex`@supports (display: nonexist) {
  #case2 { background-image: url("case2.bmp"); }
}`
  ));

  /* capture.rewriteCss = none */
  var options = {
    "capture.rewriteCss": "none",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_at_supports/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[1].textContent.trim() === `\
@supports (display: block) {
  #case1 {
    background-image: url(resources/case1.bmp);
  }
}`
  );

  assert(styleElems[2].textContent.trim() === `\
@supports (display: nonexist) {
  #case2 {
    background-image: url(resources/case2.bmp);
  }
}`
  );
});

/**
 * Check if option works for @counter-style.
 *
 * capture.rewriteCss
 * capturer.DocumentCssHandler
 */
$it.skipIf($.noAtCounterStyle)('test_capture_css_rewriteCss_at_counter_style', async function () {
  /* capture.rewriteCss = url */
  var options = {
    "capture.rewriteCss": "url",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_at_counter_style/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
@counter-style mycounter {
  system: cyclic;
  suffix: " ";
  symbols: url("1.bmp") url("2.bmp") url("3.bmp");
  symbols: Ⓐ Ⓑ Ⓒ Ⓓ Ⓔ Ⓕ Ⓖ;
}`
  );

  /* capture.rewriteCss = tidy */
  var options = {
    "capture.rewriteCss": "tidy",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_at_counter_style/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
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
      '[\\s\\S]*?'}}`
  ));

  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_at_counter_style/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
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
      '[\\s\\S]*?'}}`
  ));

  /* capture.rewriteCss = none */
  var options = {
    "capture.rewriteCss": "none",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_at_counter_style/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
@counter-style mycounter {
  system: cyclic;
  suffix: " ";
  symbols: url(./resources/1.bmp) url(./resources/2.bmp) url(./resources/3.bmp);
  symbols: Ⓐ Ⓑ Ⓒ Ⓓ Ⓔ Ⓕ Ⓖ;
}`
  );
});

/**
 * Check if option works for @layer.
 *
 * capture.rewriteCss
 * capturer.DocumentCssHandler
 */
$it.skipIf($.noAtLayer)('test_capture_css_rewriteCss_at_layer', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_at_layer/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
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
}`
  ));

  assert(styleElems[2].textContent.trim().match(
    cssRegex`@layer special2 {
  #case2 { background-image: url("case2s.bmp"); }
}
@layer base2 {
  #case2 { background-image: url("case2b.bmp"); }
}`
  ));
});

/**
 * Check DOM matching for capture.rewriteCss = "match"
 *
 * capture.rewriteCss
 */
it('test_capture_css_rewriteCss_match', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_match/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("green.bmp"));
  assert(!zip.file("unsupported-1.bmp"));
  assert(!zip.file("unsupported-2.bmp"));
  assert(!zip.file("unsupported-3.bmp"));
  assert(!zip.file("unsupported-4.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[0].textContent.trim() === '');

  assert(styleElems[1].textContent.trim() === '');

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

  assert(styleElems[5].textContent.trim() === ``);
});

it('test_capture_css_rewriteCss_match_pseudo', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_match_pseudo/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[0].textContent.trim() === `:hover { }`);

  assert(styleElems[1].textContent.trim() === `#pseudo1::before { }`);

  assert(styleElems[2].textContent.trim() === `#pseudo2:not([hidden]) { }`);

  assert(styleElems[3].textContent.trim() === `#pseudo3:not(blockquote) { }`);

  assert(styleElems[4].textContent.trim() === `[id="pseudo4"]:not([hidden]) { }`);

  assert(styleElems[5].textContent.trim() === `[id="pseudo5"]:not(blockquote) { }`);

  assert(styleElems[6].textContent.trim() === `#pseudo6 :nth-of-type(1) { }`);

  assert(styleElems[7].textContent.trim() === ``);

  assert(styleElems[8].textContent.trim() === `:root > body > #pseudo8 { }`);

  assert(styleElems[9].textContent.trim() === ``);

  assert(styleElems[10].textContent.trim() === `:scope > body > #pseudo10 { }`);

  assert(styleElems[11].textContent.trim() === ``);
});

$it.skipIf($.noIsPseudo)('test_capture_css_rewriteCss_match_pseudo_is', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_match_pseudo/rewrite_is.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[1].textContent.trim() === `#pseudo1:is(blockquote) { }`);

  assert(styleElems[2].textContent.trim() === ``);

  assert(styleElems[3].textContent.trim() === `:is(#pseudo3):not([hidden]) { }`);

  assert(styleElems[4].textContent.trim() === `:is(#pseudo4):not(blockquote) { }`);

  assert(styleElems[5].textContent.trim() === `:where(nonexist, #pseudo5) { }`);
});

it('test_capture_css_rewriteCss_match_shadow_host', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_match_shadow/rewrite_host.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host = doc.querySelector('#host1');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('style:nth-of-type(2)').textContent.trim() === `\
:host { background-color: lime; }
:host #elem1 { background-color: yellow; }
:host #elem2:hover { background-color: yellow; }
:host > #elem3 { background-color: yellow; }
:host > #elem4:hover { background-color: yellow; }`);

  var host = doc.querySelector('#host2');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('style:nth-of-type(2)').textContent.trim() === `\
:host(#host2) { background-color: lime; }
:host(#host2) #elem1 { background-color: yellow; }
:host(#host2) #elem2:hover { background-color: yellow; }
:host(#host2) > #elem3 { background-color: yellow; }
:host(#host2) > #elem4:hover { background-color: yellow; }`);

  var host = doc.querySelector('#host3');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('style:nth-of-type(2)').textContent.trim() === `\
:host(#nonexist) { background-color: lime; }
:host(#nonexist) #elem1 { background-color: yellow; }
:host(#nonexist) #elem2:hover { background-color: yellow; }
:host(#nonexist) > #elem3 { background-color: yellow; }
:host(#nonexist) > #elem4:hover { background-color: yellow; }`);
});

$it.skipIf($.noHostContextPseudo)('test_capture_css_rewriteCss_match_shadow_host_context', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_match_shadow/rewrite_host_context.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host = doc.querySelector('#host1');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('style:nth-of-type(2)').textContent.trim() === `\
:host-context(body) { background-color: lime; }
:host-context(body) #elem1 { background-color: yellow; }
:host-context(body) #elem2:hover { background-color: yellow; }
:host-context(body) > #elem3 { background-color: yellow; }
:host-context(body) > #elem4:hover { background-color: yellow; }`);

  var host = doc.querySelector('#host2');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('style:nth-of-type(2)').textContent.trim() === `\
:host-context(#nonexist) { background-color: lime; }
:host-context(#nonexist) #elem1 { background-color: yellow; }
:host-context(#nonexist) #elem2:hover { background-color: yellow; }
:host-context(#nonexist) > #elem3 { background-color: yellow; }
:host-context(#nonexist) > #elem4:hover { background-color: yellow; }`);
});

it('test_capture_css_rewriteCss_match_shadow_slotted', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_match_shadow/rewrite_slotted.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host = doc.querySelector('#person1');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('style').textContent.trim() === `\
::slotted(*) { background-color: yellow; }
::slotted(p) { text-decoration: underline; }
div > ::slotted(*) { font-size: 1.2em; }`);

  var host = doc.querySelector('#person2');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('style').textContent.trim() === `\
::slotted(*) { background-color: yellow; }
::slotted(p) { text-decoration: underline; }
div > ::slotted(*) { font-size: 1.2em; }`);

  var host = doc.querySelector('#person3');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('style').textContent.trim() === `\
::slotted(*) { background-color: yellow; }
::slotted(p) { text-decoration: underline; }
div > ::slotted(*) { font-size: 1.2em; }`);
});

$it.skipIf($.noPartPseudo)('test_capture_css_rewriteCss_match_shadow_part', async function () {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_match_shadow/rewrite_part.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
::part(elem1) { background-color: lime; }
#host1::part(elem2) { background-color: lime; }
#host1::part(nonexist) { background-color: red; }`);
});

/**
 * Check cross-origin CSS for "tidy" and "match"
 *
 * capture.rewriteCss
 */
it('test_capture_css_rewriteCss_cross_origin', async function () {
  /* capture.rewriteCss = tidy */
  var options = {
    "capture.rewriteCss": "tidy",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_cross_origin/rewrite.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file('linked.css');
  var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(cssText === `\
@import url("imported.css");
#linked { background-color: green; }
#unused { background-color: red; }`);

  var cssFile = zip.file('imported.css');
  var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(cssText === `\
#imported { background-color: green; }
#unused { background-color: red; }`);

  /* capture.rewriteCss = tidy (headless) */
  var options = {
    "capture.rewriteCss": "tidy",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_css_rewriteCss_cross_origin/rewrite.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file('linked.css');
  var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(cssText === `\
@import url("imported.css");
#linked { background-color: green; }
#unused { background-color: red; }`);

  var cssFile = zip.file('imported.css');
  var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(cssText === `\
#imported { background-color: green; }
#unused { background-color: red; }`);

  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_cross_origin/rewrite.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file('linked.css');
  var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(cssText === `\
@import url("imported.css");
#linked { background-color: green; }`);

  var cssFile = zip.file('imported.css');
  var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(cssText === `\
#imported { background-color: green; }`);

  /* capture.rewriteCss = match (headless) */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_css_rewriteCss_cross_origin/rewrite.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file('linked.css');
  var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(cssText === `\
@import url("imported.css");
#linked { background-color: green; }`);

  var cssFile = zip.file('imported.css');
  var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
  assert(cssText === `\
#imported { background-color: green; }`);
});

/**
 * Check if option works for nesting CSS.
 *
 * capture.rewriteCss
 * capturer.DocumentCssHandler
 */
$it.skipIf($.noNestingCss)('test_capture_css_rewriteCss_nesting', async function () {
  /* capture.rewriteCss = url */
  var options = {
    "capture.rewriteCss": "url",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_nesting/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('case1.bmp'));
  assert(zip.file('case1-1.bmp'));
  assert(zip.file('case1-1-1.bmp'));
  assert(zip.file('case1-1-2.bmp'));
  assert(zip.file('case1-2.bmp'));
  assert(zip.file('case1-2-1.bmp'));
  assert(zip.file('case1-2-2.bmp'));
  assert(zip.file('case2-1.bmp'));
  assert(zip.file('dummy.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
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

  /* capture.rewriteCss = tidy */
  var options = {
    "capture.rewriteCss": "tidy",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_nesting/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('case1.bmp'));
  assert(zip.file('case1-1.bmp'));
  assert(zip.file('case1-1-1.bmp'));
  assert(zip.file('case1-1-2.bmp'));
  assert(zip.file('case1-2.bmp'));
  assert(zip.file('case1-2-1.bmp'));
  assert(zip.file('case1-2-2.bmp'));
  assert(zip.file('case2-1.bmp'));
  assert(zip.file('dummy.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // the parsed CSS is automatically prepended "& " in some newer browsers
  var css = doc.querySelector('style').textContent.trim();
  var cssRegex1 = cssRegex`.case1, #nonexist {
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
}`;
  var cssRegex2 = cssRegex`.case1, #nonexist {
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
}`;
  assert(css.match(cssRegex1) || css.match(cssRegex2));

  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_nesting/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('case1.bmp'));
  assert(zip.file('case1-1.bmp'));
  assert(zip.file('case1-1-1.bmp'));
  assert(zip.file('case1-1-2.bmp'));
  assert(zip.file('case1-2.bmp'));
  assert(zip.file('case1-2-1.bmp'));
  assert(zip.file('case1-2-2.bmp'));
  assert(zip.file('case2-1.bmp'));
  assert(!zip.file('dummy.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // the parsed CSS is automatically prepended "& " in some newer browsers
  var css = doc.querySelector('style').textContent.trim();
  var cssRegex1 = cssRegex`.case1, #nonexist {
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
}`;
  var cssRegex2 = cssRegex`.case1, #nonexist {
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
}`;
  assert(css.match(cssRegex1) || css.match(cssRegex2));

  /* capture.rewriteCss = none */
  var options = {
    "capture.rewriteCss": "none",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss_nesting/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file('case1.bmp'));
  assert(!zip.file('case1-1.bmp'));
  assert(!zip.file('case1-1-1.bmp'));
  assert(!zip.file('case1-1-2.bmp'));
  assert(!zip.file('case1-2.bmp'));
  assert(!zip.file('case1-2-1.bmp'));
  assert(!zip.file('case1-2-2.bmp'));
  assert(!zip.file('case2-1.bmp'));
  assert(!zip.file('dummy.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
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

/**
 * Check CSS syntax parsing
 *
 * scrapbook.parseCssText
 */
it('test_capture_css_syntax', async function () {
  /* background */
  var options = {
    "capture.style": "save",
    "capture.font": "blank",
    "capture.imageBackground": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_syntax/background.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var css = doc.querySelectorAll('style');
  assert(css[1].textContent.trim() === `#test1 { background: url("${localhost}/capture_css_syntax/green.bmp"); }`);
  assert(css[2].textContent.trim() === `#test2 { background: url("${localhost}/capture_css_syntax/green.bmp"); }`);
  assert(css[3].textContent.trim() === `#test3 { background: url("${localhost}/capture_css_syntax/green.bmp"); }`);
  assert(css[4].textContent.trim() === `#test4 { background: url( "${localhost}/capture_css_syntax/green.bmp" ); }`);
  assert(css[5].textContent.trim() === `#test5 { background: url("${localhost}/capture_css_syntax/green.bmp"); }`);
  assert(css[6].textContent.trim() === `#test6 { background: "green.bmp"; }`);
  assert(css[7].textContent.trim() === `#test7 { background: url/*c*/("green.bmp"); }`);
  assert(css[8].textContent.trim() === `#test8 { background: url(/*c*/"green.bmp"); }`);
  assert(css[9].textContent.trim() === `#test9 { background: url("green.bmp"/*c*/); }`);
  assert(css[10].textContent.trim() === `#test10 { background: url("green.bmp" "yellow.bmp"); }`);
  assert(css[11].textContent.trim() === `#test11 { background:url("${localhost}/capture_css_syntax/green.bmp"); }`);
  assert(css[12].textContent.trim() === `#test12 { background: URL("${localhost}/capture_css_syntax/green.bmp"); }`);
  assert(css[13].textContent.trim() === `#test13 { background: Url("${localhost}/capture_css_syntax/green.bmp"); }`);
  assert(css[14].textContent.trim() === `#test14 { /*background: url("green.bmp");*/ }`);
  assert(css[15].textContent.trim() === `#test15 { background: url("${localhost}/capture_css_syntax/foo'bar.bmp"); }`);
  assert(css[16].textContent.trim() === `#test16 { background: url("${localhost}/capture_css_syntax/foo'bar.bmp"); }`);
  assert(css[17].textContent.trim() === `#test17 { background: url(  "${localhost}/capture_css_syntax/green.bmp"  ); }`);
  assert(css[18].textContent.trim() === `#test18 { background: url("${localhost}/*c*/green.bmp"); }`);
  assert(css[19].textContent.trim() === `#test19 { background: url("${localhost}/capture_css_syntax/green.bmp/*c*/"); }`);
  assert(css[20].textContent.trim() === `#test20 { background: /*url("green.bmp"); }`);

  /* font */
  var options = {
    "capture.style": "save",
    "capture.font": "link",
    "capture.imageBackground": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_syntax/font.html`,
    options: Object.assign({}, baseOptions, options),
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

  /* import */
  var options = {
    "capture.style": "link",
    "capture.font": "blank",
    "capture.imageBackground": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_syntax/import.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var css = doc.querySelectorAll('style');
  assert(css[1].textContent.trim() === `@import "${localhost}/capture_css_syntax/import/style1.css";`);
  assert(css[2].textContent.trim() === `@import "${localhost}/capture_css_syntax/import/style2.css";`);
  assert(css[3].textContent.trim() === `@import url("${localhost}/capture_css_syntax/import/style3.css");`);
  assert(css[4].textContent.trim() === `@import url("${localhost}/capture_css_syntax/import/style4.css");`);
  assert(css[5].textContent.trim() === `@import url("${localhost}/capture_css_syntax/import/style5.css");`);
  assert(css[6].textContent.trim() === `@import  "${localhost}/capture_css_syntax/import/style6.css" ;`);
  assert(css[7].textContent.trim() === `@import "${localhost}/capture_css_syntax/import/style7.css"/*c*/;`);
  assert(css[8].textContent.trim() === `@import/*c*/"${localhost}/capture_css_syntax/import/style8.css";`);
  assert(css[9].textContent.trim() === `@import"${localhost}/capture_css_syntax/import/style9.css";`);
  assert(css[10].textContent.trim() === `@import import/style10.css;`);
  assert(css[11].textContent.trim() === `@importurl("import/style11.css");`);
  assert(css[12].textContent.trim() === `@IMPORT "${localhost}/capture_css_syntax/import/style12.css";`);
  assert(css[13].textContent.trim() === `@import "${localhost}/capture_css_syntax/import/style13.css" screen;`);
  assert(css[14].textContent.trim() === `/* @import "import/style14.css"; */`);
  // assert(css[15].textContent.trim() === `#test15::after { content: '@import "import/style15.css"'; }`);
});

/**
 * Check encoding detection for an external or imported CSS
 *
 * scrapbook.parseCssFile
 */
it('test_capture_css_charset', async function () {
  const hasBomUtf8 = async function (blob) {
    var u8ar = new Uint8Array(await readFileAsArrayBuffer(blob.slice(0, 3)));
    return u8ar[0] === 0xEF && u8ar[1] === 0xBB && u8ar[2] === 0xBF;
  };

  // captureHeadless doen't use dynamic CSS 
  for (const func of ["capture", "captureHeadless"]) {
    console.debug("func = %s", func);

    var options = {
      "capture.style": "save",
    };
    var blob = await global[func]({
      url: `${localhost}/capture_css_charset/basic/index.html`,
      options: Object.assign({}, baseOptions, options),
    });

    var zip = await new JSZip().loadAsync(blob);

    var file = zip.file('header_big5.py.css');
    var blob = new Blob([await file.async('blob')], {type: "text/css"});
    var text = (await readFileAsText(blob)).trim();
    assert(text === `#test1::after { content: "中文"; }`);
    assert(!await hasBomUtf8(blob));

    var file = zip.file('bom_utf16.css');
    var blob = new Blob([await file.async('blob')], {type: "text/css"});
    var text = (await readFileAsText(blob)).trim();
    assert(text === `#test2::after { content: "中文"; }`);
    assert(!await hasBomUtf8(blob));

    var file = zip.file('at_big5.css');
    var blob = new Blob([await file.async('blob')], {type: "text/css"});
    var text = (await readFileAsText(blob)).trim();
    assert(text === `@charset "Big5";
#test3::after { content: "中文"; }`);
    assert(await hasBomUtf8(blob));

    var file = zip.file('utf8.css');
    var blob = new Blob([await file.async('blob')], {type: "text/css"});
    var text = (await readFileAsText(blob)).trim();
    assert(text === `#test4::after { content: "中文"; }`);
    assert(!await hasBomUtf8(blob));

    var file = zip.file('header_utf8_bom_utf8.py.css');
    var blob = new Blob([await file.async('blob')], {type: "text/css"});
    var text = (await readFileAsText(blob)).trim();
    assert(text === `#test5::after { content: "中文"; }`);
    assert(!await hasBomUtf8(blob));

    var file = zip.file('header_utf8_at_big5.py.css');
    var blob = new Blob([await file.async('blob')], {type: "text/css"});
    var text = (await readFileAsText(blob)).trim();
    assert(text === `@charset "Big5";
#test6::after { content: "中文"; }`);
    assert(await hasBomUtf8(blob));

    var file = zip.file('bom_utf16_at_big5.css');
    var blob = new Blob([await file.async('blob')], {type: "text/css"});
    var text = (await readFileAsText(blob)).trim();
    assert(text === `@charset "Big5";
#test7::after { content: "中文"; }`);
    assert(await hasBomUtf8(blob));
  }
});

/**
 * Check handling of document charset
 *
 * scrapbook.parseCssFile
 */
it('test_capture_css_charset_doc_charset', async function () {
  const hasBomUtf8 = async function (blob) {
    var u8ar = new Uint8Array(await readFileAsArrayBuffer(blob.slice(0, 3)));
    return u8ar[0] === 0xEF && u8ar[1] === 0xBB && u8ar[2] === 0xBF;
  };

  /* capture: uses dynamic CSS, which is determined by browser parsing */
  var options = {
    "capture.style": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_charset/doc_charset/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var file = zip.file('link.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `@import "link_import.css";
#link::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('link_import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#link_import::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `@import "import_import.css";
#import::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('import_import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#import_import::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  /* captureHeadless: no dynamic CSS */
  var options = {
    "capture.style": "save",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_css_charset/doc_charset/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var file = zip.file('link.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `\
@import "link_import.css";
#link::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('link_import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#link_import::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `\
@import "import_import.css";
#import::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('import_import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#import_import::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('link-charset.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `\
@charset "utf-8";
#link-charset::after { content: "中文"; }`);
  assert(await hasBomUtf8(blob));

  var file = zip.file('import-charset.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `\
@charset "utf-8";
#import-charset::after { content: "中文"; }`);
  assert(await hasBomUtf8(blob));
});

/**
 * Check handling of deprecated and obsolete link[charset]
 *
 * scrapbook.parseCssFile
 */
it('test_capture_css_charset_link_charset', async function () {
  const hasBomUtf8 = async function (blob) {
    var u8ar = new Uint8Array(await readFileAsArrayBuffer(blob.slice(0, 3)));
    return u8ar[0] === 0xEF && u8ar[1] === 0xBB && u8ar[2] === 0xBF;
  };

  /* capture: uses dynamic CSS, which is determined by browser parsing */
  var options = {
    "capture.style": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_charset/link_charset/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('link').hasAttribute('charset'));

  var file = zip.file('link.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `\
@import "link_import.css";
#link::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('link_import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#link_import::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  /* captureHeadless: no dynamic CSS */
  var options = {
    "capture.style": "save",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_css_charset/link_charset/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('link').hasAttribute('charset'));

  var file = zip.file('link.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `\
@import "link_import.css";
#link::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('link_import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#link_import::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  /* capture.style = link: keep link[charset] */
  var options = {
    "capture.style": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_charset/link_charset/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('link').getAttribute('charset') === 'big5');

  /* file with multiple link[charset] should be saved separatedly */
  var options = {
    "capture.style": "save",
    "capture.saveResourcesSequentially": true,
    "capture.downLink.doc.depth": 0,
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_css_charset/link_charset/bad.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var file = zip.file('link.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `\
@import "link_import.css";
#link::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('link_import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#link_import::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('link-1.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text !== `\
@import "link_import.css";
#link::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html"
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_css_charset/link_charset/bad.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_css_charset/link_charset/bad.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      },
      {
       "path": "link.css",
       "url": `${localhost}/capture_css_charset/link_charset/link.css`,
       "role": "css-big5",
       "token": getToken(`${localhost}/capture_css_charset/link_charset/link.css`, "css-big5")
      },
      {
       "path": "link_import.css",
       "url": `${localhost}/capture_css_charset/link_charset/link_import.css`,
       "role": "css-big5",
       "token": getToken(`${localhost}/capture_css_charset/link_charset/link_import.css`, "css-big5")
      },
      {
       "path": "link-1.css",
       "url": `${localhost}/capture_css_charset/link_charset/link.css`,
       "role": "css-utf-8",
       "token": getToken(`${localhost}/capture_css_charset/link_charset/link.css`, "css-utf-8")
      },
      {
       "path": "link_import-1.css",
       "url": `${localhost}/capture_css_charset/link_charset/link_import.css`,
       "role": "css-utf-8",
       "token": getToken(`${localhost}/capture_css_charset/link_charset/link_import.css`, "css-utf-8")
      },
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));
});

/**
 * Check whether linked and imported CSS are all rewritten
 * based to the CSS file (rather than the web page)
 *
 * inline and internal CSS are checked in test_capture_css_rewriteCss
 */
it('test_capture_css_rewrite', async function () {
  var options = {
    "capture.imageBackground": "link",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewrite/index.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  // @TODO: HTTP Link header is supported by Firefox 66 but not by Chromium 73
  //        and WebScrapBook currently.
  // var file = zip.file('header.css');
  // var blob = new Blob([await file.async('blob')], {type: "text/css"});
  // var text = (await readFileAsText(blob)).trim();
  // assert(text === `#header { background: url("${localhost}/capture_css_rewrite/green.bmp"); }`);

  var file = zip.file('link.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#link { background: url("${localhost}/capture_css_rewrite/green.bmp"); }`);

  var file = zip.file('import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#import { background: url("${localhost}/capture_css_rewrite/green.bmp"); }`);
});

/**
 * Check if URL is resolved correctly when base is set to another directory
 */
it('test_capture_css_rewrite_base', async function () {
  var options = {
    "capture.imageBackground": "link",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewrite_base/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `#internal { background: url("${localhost}/capture_css_rewrite_base/base/green.bmp"); }`);

  var file = zip.file('style.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#link { background: url("${localhost}/capture_css_rewrite_base/link/yellow.bmp"); }`);
});

/**
 * Check for "" and hash URL
 * They should be ignored and no file is retrieved
 */
it('test_capture_css_rewrite_empty', async function () {
  var blob = await capture({
    url: `${localhost}/capture_css_rewrite_empty/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `\
#invalid1 { background-image: url(""); }
#invalid2 { background-image: url("#123"); }`);
});

/**
 * Check for a URL pointing to main page (a bad case)
 * It will be regarded as a CSS file: be fetched, parsed, and saved.
 */
it('test_capture_css_rewrite_bad', async function () {
  var blob = await capture({
    url: `${localhost}/capture_css_rewrite_bad/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index-1.html"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `#bad1 { background-image: url("index-1.html"); }`);
});

/**
 * Check if circular CSS referencing is handled correctly
 */
it('test_capture_css_circular', async function () {
  /* htz */
  // keep original inter-referencing between downloaded files
  var options = {
    "capture.saveAs": "zip",
    "capture.style": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  // style1.css
  var file = zip.file('style1.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `@import "style2.css#123";\nbody { color: red; }`);

  // style2.css
  var file = zip.file('style2.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `@import "style3.css";\nbody { color: green; }`);

  // style3.css
  var file = zip.file('style3.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `@import "style1.css";\nbody { color: blue; }`);

  /* singleHtml */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.style": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  // style1.css
  var url = doc.querySelector('link').getAttribute('href');
  var text = (await xhr({url, responseType: "text"})).response;
  var match = text.match(rawRegex`${'^'}@import "${'('}data:text/css;charset=UTF-8;filename=style2.css,${'[^"#]*)(?:#[^"]*)?'}";`);
  assert(match);

  // style2.css
  var url = match[1];
  var text = (await xhr({url, responseType: "text"})).response;
  var match = text.match(rawRegex`${'^'}@import "${'('}data:text/css;charset=UTF-8;filename=style3.css,${'[^"#]*)(?:#[^"]*)?'}";`);
  assert(match);

  // style3.css
  var url = match[1];
  var text = (await xhr({url, responseType: "text"})).response;
  assert(text.trim() === `@import "urn:scrapbook:download:circular:url:${localhost}/capture_css_circular/style1.css";
body { color: blue; }`);
});

/**
 * Check if self-pointing circular CSS referencing is handled correctly
 */
it('test_capture_css_circular_self', async function () {
  /* singleHtml */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.style": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_circular_self/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  // style1.css
  var url = doc.querySelector('link').getAttribute('href');
  var text = (await xhr({url, responseType: "text"})).response;
  assert(text.trim() === `@import "urn:scrapbook:download:circular:url:${localhost}/capture_css_circular_self/style1.css";
body { color: red; }`);
});

/**
 * When the origin of a CSS file is different from the source document,
 * the script cannot read its CSS rules directly and a workaround is required.
 * Check if it works: only used bg images and fonts are saved.
 */
it('test_capture_css_cross_origin', async function () {
  var options = {
    "capture.imageBackground": "save-used",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_cross_origin/cross_origin.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('bg1.bmp'));
  assert(zip.file('font1.woff'));
  assert(zip.file('bg2.bmp'));
  assert(zip.file('font2.woff'));

  // same origin
  var cssFile = zip.file('style.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#bg1 { background: url("bg1.bmp"); }
#neverused { background: url(""); }

@font-face { font-family: bgFont1; src: url("font1.woff"); }
@font-face { font-family: neverusedFont1; src: url(""); }`);

  // cross origin
  var cssFile = zip.file('style2.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#bg2 { background: url("bg2.bmp"); }
#neverused2 { background: url(""); }

@font-face { font-family: bgFont2; src: url("font2.woff"); }
@font-face { font-family: neverusedFont2; src: url(""); }`);
});

/**
 * Check if dynamic stylesheets are handled correctly.
 *
 * capturer.DocumentCssHandler
 */
it('test_capture_css_dynamic', async function () {
  /* save */
  var options = {
    "capture.imageBackground": "save",
    "capture.font": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_dynamic/dynamic.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('link.css'));
  assert(zip.file('import.css'));
  assert(!zip.file('internal-deleted.bmp'));
  assert(zip.file('internal-inserted.bmp'));
  assert(!zip.file('link-deleted.bmp'));
  assert(zip.file('link-inserted.bmp'));
  assert(!zip.file('import-deleted.bmp'));
  assert(zip.file('import-inserted.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[1].textContent.trim() === `#internal-inserted { background-image: url("internal-inserted.bmp"); }`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link-inserted { background-image: url("link-inserted.bmp"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#import-inserted { background-image: url("import-inserted.bmp"); }`);

  /* save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_dynamic/dynamic.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('link.css'));
  assert(zip.file('import.css'));
  assert(!zip.file('internal-deleted.bmp'));
  assert(zip.file('internal-inserted.bmp'));
  assert(!zip.file('link-deleted.bmp'));
  assert(zip.file('link-inserted.bmp'));
  assert(!zip.file('import-deleted.bmp'));
  assert(zip.file('import-inserted.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[1].textContent.trim() === `#internal-inserted { background-image: url("internal-inserted.bmp"); }`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link-inserted { background-image: url("link-inserted.bmp"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#import-inserted { background-image: url("import-inserted.bmp"); }`);
});

/**
 * Check if dynamic stylesheets rename are handled correctly.
 *
 * capturer.DocumentCssHandler
 */
it('test_capture_css_dynamic_rename', async function () {
  var options = {
    "capture.imageBackground": "save",
    "capture.font": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_dynamic_rename/dynamic.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('link.css'));
  assert(zip.file('link-1.css'));
  assert(zip.file('link-2.css'));
  assert(zip.file('link-deleted.bmp'));
  assert(zip.file('link-inserted.bmp'));
  assert(zip.file('import.css'));
  assert(zip.file('import-1.css'));
  assert(zip.file('import-2.css'));
  assert(zip.file('import-deleted.bmp'));
  assert(zip.file('import-inserted.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var linkElems = doc.querySelectorAll('link[rel~="stylesheet"]');
  var linkNames = Array.prototype.map.call(linkElems, (elem) => {
    return elem.getAttribute('href').split('#');
  });

  assert(linkNames[0][0] === linkNames[1][0]);
  assert(linkNames[0][0] !== linkNames[2][0]);
  assert(linkNames[0][0] !== linkNames[3][0]);
  assert(linkNames[2][0] !== linkNames[3][0]);

  assert(linkNames[0][1] === undefined);
  assert(linkNames[1][1] === '123');
  assert(linkNames[2][1] === 'abc');
  assert(linkNames[3][1] === 'def');

  var importNames = doc.querySelectorAll('style')[1].textContent.trim().split('\n').map((url) => {
    return url.match(rawRegex`@import "${'([^"]*)'}"`)[1].split('#');
  });

  assert(importNames[0][0] === importNames[1][0]);
  assert(importNames[0][0] !== importNames[2][0]);
  assert(importNames[0][0] !== importNames[3][0]);
  assert(importNames[2][0] !== importNames[3][0]);

  assert(importNames[0][1] === undefined);
  assert(importNames[1][1] === '123');
  assert(importNames[2][1] === 'abc');
  assert(importNames[3][1] === 'def');
});

/**
 * Check if adoptedStyleSheets are handled correctly.
 *
 * capture.style
 * capture.adoptedStyleSheet
 * capturer.DocumentCssHandler
 */
$it.skipIf($.noAdoptedStylesheet)('test_capture_css_adopted', async function () {
  /* capture.adoptedStyleSheet = save, capture.style = save */
  var options = {
    "capture.style": "save",
    "capture.adoptedStyleSheet": "save",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('green.bmp'));
  assert(zip.file('nonexist.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  var docElem = doc.documentElement;
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1',
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
    [
      `#adopted1-1 { background-color: rgb(0, 255, 0); }`,
      `#adopted1-2 { background-image: /*scrapbook-orig-url="./green.bmp"*/url("green.bmp"); }`,
      `#nonexist { background-image: /*scrapbook-orig-url="./nonexist.bmp"*/url("nonexist.bmp"); }`,
    ].join('\n\n'),
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
    [
      `#adopted2-1 { background-color: rgb(0, 255, 0); }`,
      `#adopted2-2 { background-image: /*scrapbook-orig-url="./green.bmp"*/url("green.bmp"); }`,
      `#nonexist { background-image: /*scrapbook-orig-url="./nonexist.bmp"*/url("nonexist.bmp"); }`,
    ].join('\n\n'),
  );
  assertNoRecord(docElem);

  /* capture.adoptedStyleSheet = save, capture.style = link */
  var options = {
    "capture.style": "link",
    "capture.adoptedStyleSheet": "save",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('green.bmp'));
  assert(zip.file('nonexist.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  var docElem = doc.documentElement;
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1',
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
    [
      `#adopted1-1 { background-color: rgb(0, 255, 0); }`,
      `#adopted1-2 { background-image: /*scrapbook-orig-url="./green.bmp"*/url("green.bmp"); }`,
      `#nonexist { background-image: /*scrapbook-orig-url="./nonexist.bmp"*/url("nonexist.bmp"); }`,
    ].join('\n\n'),
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
    [
      `#adopted2-1 { background-color: rgb(0, 255, 0); }`,
      `#adopted2-2 { background-image: /*scrapbook-orig-url="./green.bmp"*/url("green.bmp"); }`,
      `#nonexist { background-image: /*scrapbook-orig-url="./nonexist.bmp"*/url("nonexist.bmp"); }`,
    ].join('\n\n'),
  );
  assertNoRecord(docElem);

  /* capture.adoptedStyleSheet = save, capture.style = blank */
  var options = {
    "capture.style": "blank",
    "capture.adoptedStyleSheet": "save",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file('green.bmp'));
  assert(!zip.file('nonexist.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  var docElem = doc.documentElement;
  assert(!docElem.hasAttribute('data-scrapbook-adoptedstylesheets'));
  assertNoRecord(docElem, {filter: {regexAttr: /^data-scrapbook-adoptedstylesheet-\d+$/}});

  /* capture.adoptedStyleSheet = save, capture.style = remove */
  var options = {
    "capture.style": "remove",
    "capture.adoptedStyleSheet": "save",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file('green.bmp'));
  assert(!zip.file('nonexist.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  var docElem = doc.documentElement;
  assert(!docElem.hasAttribute('data-scrapbook-adoptedstylesheets'));
  assertNoRecord(docElem, {filter: {regexAttr: /^data-scrapbook-adoptedstylesheet-\d+$/}});

  /* capture.adoptedStyleSheet = remove */
  var options = {
    "capture.style": "save",
    "capture.adoptedStyleSheet": "remove",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file('green.bmp'));
  assert(!zip.file('nonexist.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  var docElem = doc.documentElement;
  assert(!docElem.hasAttribute('data-scrapbook-adoptedstylesheets'));
  assertNoRecord(docElem, {filter: {regexAttr: /^data-scrapbook-adoptedstylesheet-\d+$/}});
});

/**
 * Check if adoptedStyleSheets shared among document and shadow roots are handled correctly.
 *
 * capture.adoptedStyleSheet
 * capture.rewriteCss
 * capturer.DocumentCssHandler
 */
$it.skipIf($.noAdoptedStylesheet)('test_capture_css_adopted_shadow', async function () {
  var options = {
    "capture.imageBackground": "save-used",
    "capture.font": "save-used",
  };

  /* capture.adoptedStyleSheet = save, capture.rewriteCss = match */
  Object.assign(options, {
    "capture.adoptedStyleSheet": "save",
    "capture.rewriteCss": "match",
  });
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/shadow.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('image1-1.bmp'));
  assert(zip.file('image1-2.bmp'));
  assert(zip.file('image1-3.bmp'));
  assert(!zip.file('image1-4.bmp'));
  assert(zip.file('image2-1.bmp'));
  assert(zip.file('image2-2.bmp'));
  assert(zip.file('image2-3.bmp'));
  assert(!zip.file('image2-4.bmp'));
  assert(zip.file('font1-1.woff'));
  assert(zip.file('font1-2.woff'));
  assert(zip.file('font1-3.woff'));
  assert(!zip.file('font1-4.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  var docElem = doc.documentElement;
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1',
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
    [
      `#image1-1 { background-image: url("image1-1.bmp"); }`,
      `#image1-2 { background-image: url("image1-2.bmp"); }`,
      `#image1-3 { background-image: url("image1-3.bmp"); }`,
    ].join('\n\n'),
  );
  assertEqual(
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
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-2').trim(),
    [
      `#image2-1 { background-image: url("image2-1.bmp"); }`,
      `#image2-2 { background-image: url("image2-2.bmp"); }`,
      `#image2-3 { background-image: url("image2-3.bmp"); }`,
    ].join('\n\n'),
  );

  var host1 = doc.querySelector('#shadow1');
  assertEqual(
    host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1,2',
  );

  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  var host2 = shadow1.querySelector('#shadow2');
  assertEqual(
    host2.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '2',
  );

  /* capture.adoptedStyleSheet = save, capture.rewriteCss = tidy */
  Object.assign(options, {
    "capture.adoptedStyleSheet": "save",
    "capture.rewriteCss": "tidy",
  });
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/shadow.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('image1-1.bmp'));
  assert(zip.file('image1-2.bmp'));
  assert(zip.file('image1-3.bmp'));
  assert(!zip.file('image1-4.bmp'));
  assert(zip.file('image2-1.bmp'));
  assert(zip.file('image2-2.bmp'));
  assert(zip.file('image2-3.bmp'));
  assert(!zip.file('image2-4.bmp'));
  assert(zip.file('font1-1.woff'));
  assert(zip.file('font1-2.woff'));
  assert(zip.file('font1-3.woff'));
  assert(!zip.file('font1-4.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  var docElem = doc.documentElement;
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1',
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
    [
      `#image1-1 { background-image: url("image1-1.bmp"); }`,
      `#image1-2 { background-image: url("image1-2.bmp"); }`,
      `#image1-3 { background-image: url("image1-3.bmp"); }`,
      `#image1-4 { background-image: url(""); }`,
    ].join('\n\n'),
  );
  assertEqual(
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
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-2').trim(),
    [
      `#image2-1 { background-image: url("image2-1.bmp"); }`,
      `#image2-2 { background-image: url("image2-2.bmp"); }`,
      `#image2-3 { background-image: url("image2-3.bmp"); }`,
      `#image2-4 { background-image: url(""); }`,
    ].join('\n\n'),
  );

  var host1 = doc.querySelector('#shadow1');
  assertEqual(
    host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1,2',
  );

  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  var host2 = shadow1.querySelector('#shadow2');
  assertEqual(
    host2.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '2',
  );

  /* capture.adoptedStyleSheet = save, capture.rewriteCss = url */
  Object.assign(options, {
    "capture.adoptedStyleSheet": "save",
    "capture.rewriteCss": "url",
  });
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/shadow.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('image1-1.bmp'));
  assert(zip.file('image1-2.bmp'));
  assert(zip.file('image1-3.bmp'));
  assert(!zip.file('image1-4.bmp'));
  assert(zip.file('image2-1.bmp'));
  assert(zip.file('image2-2.bmp'));
  assert(zip.file('image2-3.bmp'));
  assert(!zip.file('image2-4.bmp'));
  assert(zip.file('font1-1.woff'));
  assert(zip.file('font1-2.woff'));
  assert(zip.file('font1-3.woff'));
  assert(!zip.file('font1-4.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  var docElem = doc.documentElement;
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1',
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
    [
      `#image1-1 { background-image: url("image1-1.bmp"); }`,
      `#image1-2 { background-image: url("image1-2.bmp"); }`,
      `#image1-3 { background-image: url("image1-3.bmp"); }`,
      `#image1-4 { background-image: url(""); }`,
    ].join('\n\n'),
  );
  assertEqual(
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
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-2').trim(),
    [
      `#image2-1 { background-image: url("image2-1.bmp"); }`,
      `#image2-2 { background-image: url("image2-2.bmp"); }`,
      `#image2-3 { background-image: url("image2-3.bmp"); }`,
      `#image2-4 { background-image: url(""); }`,
    ].join('\n\n'),
  );

  var host1 = doc.querySelector('#shadow1');
  assertEqual(
    host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1,2',
  );

  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  var host2 = shadow1.querySelector('#shadow2');
  assertEqual(
    host2.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '2',
  );

  /* capture.adoptedStyleSheet = save, capture.rewriteCss = none */
  Object.assign(options, {
    "capture.adoptedStyleSheet": "save",
    "capture.rewriteCss": "none",
  });
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/shadow.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file('image1-1.bmp'));
  assert(!zip.file('image1-2.bmp'));
  assert(!zip.file('image1-3.bmp'));
  assert(!zip.file('image1-4.bmp'));
  assert(!zip.file('image2-1.bmp'));
  assert(!zip.file('image2-2.bmp'));
  assert(!zip.file('image2-3.bmp'));
  assert(!zip.file('image2-4.bmp'));
  assert(!zip.file('font1-1.woff'));
  assert(!zip.file('font1-2.woff'));
  assert(!zip.file('font1-3.woff'));
  assert(!zip.file('font1-4.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  var docElem = doc.documentElement;
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1',
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
    [
      `#image1-1 { background-image: url("./image1-1.bmp"); }`,
      `#image1-2 { background-image: url("./image1-2.bmp"); }`,
      `#image1-3 { background-image: url("./image1-3.bmp"); }`,
      `#image1-4 { background-image: url("./image1-4.bmp"); }`,
    ].join('\n\n'),
  );
  assertEqual(
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
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-2').trim(),
    [
      `#image2-1 { background-image: url("./image2-1.bmp"); }`,
      `#image2-2 { background-image: url("./image2-2.bmp"); }`,
      `#image2-3 { background-image: url("./image2-3.bmp"); }`,
      `#image2-4 { background-image: url("./image2-4.bmp"); }`,
    ].join('\n\n'),
  );

  var host1 = doc.querySelector('#shadow1');
  assertEqual(
    host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0,1,2',
  );

  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  var host2 = shadow1.querySelector('#shadow2');
  assertEqual(
    host2.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '2',
  );

  /* capture.adoptedStyleSheet = remove */
  Object.assign(options, {
    "capture.adoptedStyleSheet": "remove",
    "capture.rewriteCss": "url",
  });
  var blob = await capture({
    url: `${localhost}/capture_css_adopted/shadow.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file('image1-1.bmp'));
  assert(!zip.file('image1-2.bmp'));
  assert(!zip.file('image1-3.bmp'));
  assert(!zip.file('image1-4.bmp'));
  assert(!zip.file('image2-1.bmp'));
  assert(!zip.file('image2-2.bmp'));
  assert(!zip.file('image2-3.bmp'));
  assert(!zip.file('image2-4.bmp'));
  assert(!zip.file('font1-1.woff'));
  assert(!zip.file('font1-2.woff'));
  assert(!zip.file('font1-3.woff'));
  assert(!zip.file('font1-4.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

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

/**
 * Check if option works
 *
 * capture.imageBackground
 */
it('test_capture_imageBackground', async function () {
  /* capture.imageBackground = save */
  var options = {
    "capture.imageBackground": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('link.css'));
  assert(zip.file('import.css'));
  assert(zip.file('red.bmp'));
  assert(zip.file('green.bmp'));
  assert(zip.file('blue.bmp'));
  assert(zip.file('yellow.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var bodyElem = doc.body;
  assert(bodyElem.getAttribute('background') === `green.bmp`);
  var tableElem = doc.querySelector('table');
  assert(tableElem.getAttribute('background') === `red.bmp`);
  var trElems = tableElem.querySelectorAll('tr');
  assert(trElems[0].getAttribute('background') === `green.bmp`);
  var thElem = trElems[1].querySelector('th');
  assert(thElem.getAttribute('background') === `blue.bmp`);
  var tdElem = trElems[1].querySelector('td');
  assert(tdElem.getAttribute('background') === `yellow.bmp`);

  var bqElem = doc.querySelectorAll('blockquote')[0];
  assert(bqElem.getAttribute('style') === `background: url("yellow.bmp");`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link { background: url("yellow.bmp"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#import { background: url("yellow.bmp"); }`);

  var cssElem = doc.querySelectorAll('style')[2];
  assert(cssElem.textContent.trim() === `@keyframes spin {
  from { transform: rotate(0turn); background-image: url("yellow.bmp"); }
  to { transform: rotate(1turn); }
}`);

  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('link.css'));
  assert(zip.file('import.css'));
  assert(zip.file('red.bmp'));
  assert(zip.file('green.bmp'));
  assert(zip.file('blue.bmp'));
  assert(zip.file('yellow.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var bodyElem = doc.body;
  assert(bodyElem.getAttribute('background') === `green.bmp`);
  var tableElem = doc.querySelector('table');
  assert(tableElem.getAttribute('background') === `red.bmp`);
  var trElems = tableElem.querySelectorAll('tr');
  assert(trElems[0].getAttribute('background') === `green.bmp`);
  var thElem = trElems[1].querySelector('th');
  assert(thElem.getAttribute('background') === `blue.bmp`);
  var tdElem = trElems[1].querySelector('td');
  assert(tdElem.getAttribute('background') === `yellow.bmp`);

  var bqElem = doc.querySelectorAll('blockquote')[0];
  assert(bqElem.getAttribute('style') === `background: url("yellow.bmp");`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link { background: url("yellow.bmp"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#import { background: url("yellow.bmp"); }`);

  var cssElem = doc.querySelectorAll('style')[2];
  assert(cssElem.textContent.trim() === `@keyframes spin {
  from { transform: rotate(0turn); background-image: url("yellow.bmp"); }
  to { transform: rotate(1turn); }
}`);

  /* capture.imageBackground = link */
  var options = {
    "capture.imageBackground": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 3);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var bodyElem = doc.body;
  assert(bodyElem.getAttribute('background') === `${localhost}/capture_imageBackground/green.bmp`);
  var tableElem = doc.querySelector('table');
  assert(tableElem.getAttribute('background') === `${localhost}/capture_imageBackground/red.bmp`);
  var trElems = tableElem.querySelectorAll('tr');
  assert(trElems[0].getAttribute('background') === `${localhost}/capture_imageBackground/green.bmp`);
  var thElem = trElems[1].querySelector('th');
  assert(thElem.getAttribute('background') === `${localhost}/capture_imageBackground/blue.bmp`);
  var tdElem = trElems[1].querySelector('td');
  assert(tdElem.getAttribute('background') === `${localhost}/capture_imageBackground/yellow.bmp`);

  var bqElem = doc.querySelectorAll('blockquote')[0];
  assert(bqElem.getAttribute('style') === `background: url("${localhost}/capture_imageBackground/yellow.bmp");`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link { background: url("${localhost}/capture_imageBackground/yellow.bmp"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#import { background: url("${localhost}/capture_imageBackground/yellow.bmp"); }`);

  var cssElem = doc.querySelectorAll('style')[2];
  assert(cssElem.textContent.trim() === `@keyframes spin {
  from { transform: rotate(0turn); background-image: url("${localhost}/capture_imageBackground/yellow.bmp"); }
  to { transform: rotate(1turn); }
}`);

  /* capture.imageBackground = blank */
  var options = {
    "capture.imageBackground": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 3);

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
  assert(bqElem.getAttribute('style') === `background: url("");`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link { background: url(""); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#import { background: url(""); }`);

  var cssElem = doc.querySelectorAll('style')[2];
  assert(cssElem.textContent.trim() === `@keyframes spin {
  from { transform: rotate(0turn); background-image: url(""); }
  to { transform: rotate(1turn); }
}`);
});

/**
 * Check if used background images in the CSS are mapped correctly
 *
 * capture.imageBackground
 */
it('test_capture_imageBackground_used', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.imageBackground": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal.bmp'));
  assert(!zip.file('internal-unused.bmp'));
  assert(!zip.file('internal-noncaptured.bmp'));
  assert(zip.file('link.bmp'));
  assert(!zip.file('link-unused.bmp'));
  assert(!zip.file('link-noncaptured.bmp'));
  assert(zip.file('import.bmp'));
  assert(!zip.file('import-unused.bmp'));
  assert(!zip.file('import-noncaptured.bmp'));
  assert(zip.file('pseudo-hover.bmp'));
  assert(zip.file('pseudo-active.bmp'));
  assert(zip.file('pseudo-before.bmp'));
  assert(zip.file('pseudo-after.bmp'));
  assert(zip.file('pseudo-first-letter.bmp'));
  assert(zip.file('pseudo-first-line.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[1].textContent.trim() === `\
#internal { background-image: url("internal.bmp"); }
#internal-unused { background-image: url(""); }
#internal-noncaptured { background-image: url(""); }`);
  assert(styleElems[3].textContent.trim() === `\
#pseudo-hover:hover { background-image: url("pseudo-hover.bmp"); }
#pseudo-active:active { background-image: url("pseudo-active.bmp"); }
#pseudo-before::before { background-image: url("pseudo-before.bmp"); content: "X"; }
#pseudo-after::after { background-image: url("pseudo-after.bmp"); content: "X"; }
#pseudo-first-letter::first-letter { background-image: url("pseudo-first-letter.bmp"); }
#pseudo-first-line::first-line { background-image: url("pseudo-first-line.bmp"); }`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `\
#link { background-image: url("link.bmp"); }
#link-unused { background-image: url(""); }
#link-noncaptured { background-image: url(""); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `\
#import { background-image: url("import.bmp"); }
#import-unused { background-image: url(""); }
#import-noncaptured { background-image: url(""); }`);

  /* capture.imageBackground = save-used (headless) */
  // the result is same as save
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.imageBackground": "save-used",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_imageBackground_used/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal.bmp'));
  assert(zip.file('internal-unused.bmp'));
  assert(zip.file('internal-noncaptured.bmp'));
  assert(zip.file('link.bmp'));
  assert(zip.file('link-unused.bmp'));
  assert(zip.file('link-noncaptured.bmp'));
  assert(zip.file('import.bmp'));
  assert(zip.file('import-unused.bmp'));
  assert(zip.file('import-noncaptured.bmp'));
  assert(zip.file('pseudo-hover.bmp'));
  assert(zip.file('pseudo-active.bmp'));
  assert(zip.file('pseudo-before.bmp'));
  assert(zip.file('pseudo-after.bmp'));
  assert(zip.file('pseudo-first-letter.bmp'));
  assert(zip.file('pseudo-first-line.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[1].textContent.trim() === `\
#internal { background-image: url("internal.bmp"); }
#internal-unused { background-image: url("internal-unused.bmp"); }
#internal-noncaptured { background-image: url("internal-noncaptured.bmp"); }`);
  assert(styleElems[3].textContent.trim() === `\
#pseudo-hover:hover { background-image: url("pseudo-hover.bmp"); }
#pseudo-active:active { background-image: url("pseudo-active.bmp"); }
#pseudo-before::before { background-image: url("pseudo-before.bmp"); content: "X"; }
#pseudo-after::after { background-image: url("pseudo-after.bmp"); content: "X"; }
#pseudo-first-letter::first-letter { background-image: url("pseudo-first-letter.bmp"); }
#pseudo-first-line::first-line { background-image: url("pseudo-first-line.bmp"); }`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `\
#link { background-image: url("link.bmp"); }
#link-unused { background-image: url("link-unused.bmp"); }
#link-noncaptured { background-image: url("link-noncaptured.bmp"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `\
#import { background-image: url("import.bmp"); }
#import-unused { background-image: url("import-unused.bmp"); }
#import-noncaptured { background-image: url("import-noncaptured.bmp"); }`);
});

/**
 * Check if used background images are checked correctly for a selector for
 * the root element.
 *
 * capture.imageBackground
 */
it('test_capture_imageBackground_used_root', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/root/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('green.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `html { background-image: url("green.bmp"); }`);
});

/**
 * Check if used background images in a shadow DOM are considered
 *
 * capture.imageBackground
 */
it('test_capture_imageBackground_used_shadow', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
    "capture.shadowDom": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/shadow/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('green.bmp'));
  assert(zip.file('yellow.bmp'));
  assert(zip.file('blue.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host1 = doc.querySelector('#shadow1');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('style').textContent.trim() === `\
:host { background-image: url("yellow.bmp"); }
#shadow { background-image: url("green.bmp"); }
@media all {
  #media { background-image: url("blue.bmp"); }
}`);
});

/**
 * Check if used @keyframes background images in the CSS are mapped correctly
 *
 * capture.imageBackground
 */
it('test_capture_imageBackground_used_keyframes', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.imageBackground": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/keyframes/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal-inline.bmp'));
  assert(zip.file('internal-internal.bmp'));
  assert(zip.file('internal-link.bmp'));
  assert(zip.file('internal-import.bmp'));
  assert(zip.file('link-inline.bmp'));
  assert(zip.file('link-internal.bmp'));
  assert(zip.file('link-link.bmp'));
  assert(zip.file('link-import.bmp'));
  assert(zip.file('import-inline.bmp'));
  assert(zip.file('import-internal.bmp'));
  assert(zip.file('import-link.bmp'));
  assert(zip.file('import-import.bmp'));
  assert(!zip.file('internal-inline-unused.bmp'));
  assert(!zip.file('internal-internal-unused.bmp'));
  assert(!zip.file('internal-link-unused.bmp'));
  assert(!zip.file('internal-import-unused.bmp'));
  assert(!zip.file('link-inline-unused.bmp'));
  assert(!zip.file('link-internal-unused.bmp'));
  assert(!zip.file('link-link-unused.bmp'));
  assert(!zip.file('link-import-unused.bmp'));
  assert(!zip.file('import-inline-unused.bmp'));
  assert(!zip.file('import-internal-unused.bmp'));
  assert(!zip.file('import-link-unused.bmp'));
  assert(!zip.file('import-import-unused.bmp'));
  assert(zip.file('ref-from.bmp'));
  assert(zip.file('ref-to.bmp'));
  assert(!zip.file('ref-from-noncaptured.bmp'));
  assert(!zip.file('ref-to-noncaptured.bmp'));
  assert(zip.file('ref-0.bmp'));
  assert(zip.file('ref-35.bmp'));
  assert(zip.file('ref-70.bmp'));
  assert(zip.file('ref-100.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[1].textContent.trim() === `\
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
  assert(text.trim() === `\
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
  assert(text.trim() === `\
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

  assert(styleElems[5].textContent.trim() === `\
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

  /* capture.imageBackground = save-used (headless) */
  // the result is same as save
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.imageBackground": "save-used",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_imageBackground_used/keyframes/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal-inline.bmp'));
  assert(zip.file('internal-internal.bmp'));
  assert(zip.file('internal-link.bmp'));
  assert(zip.file('internal-import.bmp'));
  assert(zip.file('link-inline.bmp'));
  assert(zip.file('link-internal.bmp'));
  assert(zip.file('link-link.bmp'));
  assert(zip.file('link-import.bmp'));
  assert(zip.file('import-inline.bmp'));
  assert(zip.file('import-internal.bmp'));
  assert(zip.file('import-link.bmp'));
  assert(zip.file('import-import.bmp'));
  assert(zip.file('internal-inline-unused.bmp'));
  assert(zip.file('internal-internal-unused.bmp'));
  assert(zip.file('internal-link-unused.bmp'));
  assert(zip.file('internal-import-unused.bmp'));
  assert(zip.file('link-inline-unused.bmp'));
  assert(zip.file('link-internal-unused.bmp'));
  assert(zip.file('link-link-unused.bmp'));
  assert(zip.file('link-import-unused.bmp'));
  assert(zip.file('import-inline-unused.bmp'));
  assert(zip.file('import-internal-unused.bmp'));
  assert(zip.file('import-link-unused.bmp'));
  assert(zip.file('import-import-unused.bmp'));
  assert(zip.file('ref-from.bmp'));
  assert(zip.file('ref-to.bmp'));
  assert(zip.file('ref-from-noncaptured.bmp'));
  assert(zip.file('ref-to-noncaptured.bmp'));
  assert(zip.file('ref-0.bmp'));
  assert(zip.file('ref-35.bmp'));
  assert(zip.file('ref-70.bmp'));
  assert(zip.file('ref-100.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[1].textContent.trim() === `\
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
  assert(text.trim() === `\
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
  assert(text.trim() === `\
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

  assert(styleElems[5].textContent.trim() === `\
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

/**
 * Check syntax for used background images
 *
 * capture.imageBackground
 */
it('test_capture_imageBackground_used_keyframes_syntax', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/keyframes_syntax/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('keyframes-1.bmp'));
  assert(zip.file('keyframes-2.bmp'));
  assert(zip.file('keyframes-complex-1.bmp'));
  assert(zip.file('keyframes-multi-1.bmp'));
  assert(zip.file('keyframes-multi-2.bmp'));
  assert(zip.file('keyframes-multi-3.bmp'));
  assert(zip.file('keyframes-after.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[1].textContent.trim() === r`@keyframes keyframes1 {
  from { background-image: url("keyframes-1.bmp"); }
  to { background-image: url("keyframes-2.bmp"); transform: translateX(40px); }
}`);
  assert(styleElems[2].textContent.trim() === r`@keyframes keyframes\Awith\ complex\\syntax {
  from { background-image: url("keyframes-complex-1.bmp"); }
  to { transform: translateX(40px); }
}`);
  assert(styleElems[3].textContent.trim() === r`@keyframes multi\ 1 {
  from { background-image: url("keyframes-multi-1.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes multi\"2\" {
  33% { background-image: url("keyframes-multi-2.bmp"); }
  66% { background-image: url("keyframes-multi-3.bmp"); }
}`);
  assert(styleElems[4].textContent.trim() === r`@keyframes after {
  from { background-image: url("keyframes-after.bmp"); }
  to { transform: translateX(40px); }
}`);
});

/**
 * Check if used background images in scoped @keyframe are handled correctly
 *
 * capture.imageBackground
 */
it('test_capture_imageBackground_used_keyframes_scope', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
    "capture.shadowDom": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/keyframes_scope/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal1.bmp'));
  assert(zip.file('internal2.bmp'));
  assert(zip.file('internal3.bmp'));
  assert(!zip.file('internal4.bmp'));
  assert(zip.file('internal5.bmp'));
  assert(zip.file('internal6.bmp'));
  assert(zip.file('internal7.bmp'));
  assert(!zip.file('internal8.bmp'));

  assert(zip.file('shadow1.bmp'));
  assert(zip.file('shadow2.bmp'));
  assert(!zip.file('shadow3.bmp'));
  assert(!zip.file('shadow4.bmp'));
  assert(zip.file('shadow5.bmp'));
  assert(zip.file('shadow6.bmp'));
  assert(!zip.file('shadow7.bmp'));
  assert(!zip.file('shadow8.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('style')[1].textContent.trim() === `\
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
  assert(shadow1.querySelectorAll('style')[1].textContent.trim() === `\
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

$it.skipIf($.noPartPseudo)('test_capture_imageBackground_used_keyframes_scope_part', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
    "capture.shadowDom": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/keyframes_scope_part/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
@keyframes mykf {
  from { background-image: url("internal.bmp"); }
  to { transform: translateX(40px); }
}
#shadow1::part(mypart) {
  font-size: 2em;
  animation: mykf 3s linear infinite;
}`);
});

it('test_capture_imageBackground_used_keyframes_scope_conditional', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
    "capture.shadowDom": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/keyframes_scope_conditional/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal.bmp'));
  assert(zip.file('shadow.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
@keyframes myframe {
  from { background-image: url("internal.bmp"); }
  to { transform: translateX(40px); }
}`);

  var host1 = doc.querySelector('#shadow1');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelectorAll('style')[1].textContent.trim() === `\
@media print {
  @keyframes myframe {
    from { background-image: url("shadow.bmp"); }
    to { transform: translateX(40px); }
  }
}`);
});

/**
 * Check if used background images are checked correctly for advanced at-rules
 * such as @layer.
 *
 * capture.imageBackground
 */
$it.skipIf($.noAtLayer)('test_capture_imageBackground_used_at', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/at/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('base.bmp'));
  assert(zip.file('special.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
@layer base, special;
@layer special {
  #case1 { background-image: url("special.bmp"); }
}
@layer base {
  #case1 { background-image: url("base.bmp"); }
}`);
});

/**
 * Do not count background images referenced only by inline styles.
 *
 * capture.imageBackground
 */
it('test_capture_imageBackground_used_inline', async function () {
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
    "capture.styleInline": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/inline/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('green.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `#neverused { background-image: url(""); }`);
  assert(styleElems[1].textContent.trim() === `\
@keyframes neverused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);

  assert(doc.querySelector('blockquote').getAttribute('style').trim() === `background-image: url("green.bmp");`);
});

/**
 * Check if used background images in adoptedStyleSheets are handled correctly
 *
 * capture.imageBackground
 */
$it.skipIf($.noAdoptedStylesheet)('test_capture_imageBackground_used_adopted', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
    "capture.shadowDom": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/adopted/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('doc.bmp'));
  assert(zip.file('shadow.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var docElem = doc.documentElement;
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '0',
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
    `#adopted { background-image: url("doc.bmp"); }`,
  );
  assertEqual(
    docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
    `#adopted { background-image: url("shadow.bmp"); }`,
  );

  var host1 = doc.querySelector('#shadow1');
  assertEqual(
    host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
    '1',
  );
});

/**
 * Check background images referenced by CSS variable.
 *
 * capture.imageBackground
 */
$it.xfail()('test_capture_imageBackground_used_var', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/var/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('var1.bmp'));
  assert(zip.file('var2.bmp'));  // @FIXME
  assert(zip.file('var3.bmp'));  // @FIXME
  assert(zip.file('var4.bmp'));  // @FIXME
  assert(zip.file('var5.bmp'));
  assert(zip.file('var6.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  assert(styleElems[0].textContent.trim() === `\
:root { --var-1: url("var1.bmp"); }
#var1 { background: var(--var-1); }`);

  // @FIXME: image URL emptied
  assert(styleElems[1].textContent.trim() === `\
@keyframes var2 {
  from { background-image: url("var2.bmp"); }
  to { transform: translateX(40px); }
}
:root { --var-2: var2 3s linear infinite; }
#var2 { animation: var(--var-2); }`);

  // @FIXME: image URL emptied
  assert(styleElems[2].textContent.trim() === `\
@keyframes var3 {
  from { background-image: url("var3.bmp"); }
  to { transform: translateX(40px); }
}
:root { --var-3: var3; }
#var3 { animation: var(--var-3) 3s linear infinite; }`);

  // @FIXME: image URL emptied
  assert(styleElems[3].textContent.trim() === `\
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

  assert(styleElems[4].textContent.trim() === `\
@keyframes var5 {
  from { background-image: var(--var-5); }
  to { transform: translateX(40px); }
}
:root { --var-5: url("var5.bmp"); }
#var5 { animation: var5 3s linear infinite; }`);

  assert(styleElems[5].textContent.trim() === `\
@keyframes var6 {
  from { --var-6: url("var6.bmp"); }
  to { transform: translateX(40px); }
}
#var6 { animation: var6 3s linear infinite; }`);
});

/**
 * Check if used background images are checked correctly for nesting CSS.
 *
 * capture.imageBackground
 */
$it.skipIf($.noNestingCss)('test_capture_imageBackground_used_nesting', async function () {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/nesting/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('case1.bmp'));
  assert(zip.file('case1-1.bmp'));
  assert(zip.file('case1-1-1.bmp'));
  assert(zip.file('case1-1-2.bmp'));
  assert(!zip.file('case1-2.bmp'));
  assert(!zip.file('case1-2-1.bmp'));
  assert(!zip.file('case1-2-2.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
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

/**
 * Check if option works
 *
 * capture.font
 */
it('test_capture_font', async function () {
  /* capture.font = save */
  var options = {
    "capture.font": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_font/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('sansation_light.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: myFont; src: url("sansation_light.woff"); }`);

  /* capture.font = save-used */
  var options = {
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('sansation_light.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: myFont; src: url("sansation_light.woff"); }`);

  /* capture.font = link */
  var options = {
    "capture.font": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_font/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: myFont; src: url("${localhost}/capture_font/sansation_light.woff"); }`);

  /* capture.font = blank */
  var options = {
    "capture.font": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_font/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: myFont; src: url(""); }`);
});

/**
 * Check if used fonts in the CSS are mapped correctly
 *
 * capture.font = "save-used"
 */
it('test_capture_font_used', async function () {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal.woff'));
  assert(zip.file('link.woff'));
  assert(zip.file('import.woff'));
  assert(zip.file('pseudo1.woff'));
  assert(zip.file('internal-keyframes.woff'));
  assert(!zip.file('neverused.woff'));
  assert(!zip.file('removed.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: internal; src: url("internal.woff"); }`);
  assert(styleElems[2].textContent.trim() === `\
@font-face { font-family: pseudo1; src: url("pseudo1.woff"); }
#pseudo1::before { font-family: pseudo1; content: "X"; }`);
  assert(styleElems[3].textContent.trim() === `\
@font-face { font-family: internal-keyframes; src: url("internal-keyframes.woff"); }`);
  assert(styleElems[5].textContent.trim() === `@font-face { font-family: neverused; src: url(""); }`);
  assert(styleElems[8].textContent.trim() === `@font-face { font-family: removed-internal; src: url(""); }`);
  assert(styleElems[9].textContent.trim() === `@font-face { font-family: removed-keyframes; src: url(""); }`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `@font-face { font-family: link; src: url("link.woff"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `@font-face { font-family: import; src: url("import.woff"); }`);

  /* capture.font = save-used (headless) */
  // the result is same as save
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.font": "save-used",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_font_used/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal.woff'));
  assert(zip.file('link.woff'));
  assert(zip.file('import.woff'));
  assert(zip.file('pseudo1.woff'));
  assert(zip.file('internal-keyframes.woff'));
  assert(zip.file('neverused.woff'));
  assert(zip.file('removed.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: internal; src: url("internal.woff"); }`);
  assert(styleElems[2].textContent.trim() === `\
@font-face { font-family: pseudo1; src: url("pseudo1.woff"); }
#pseudo1::before { font-family: pseudo1; content: "X"; }`);
  assert(styleElems[3].textContent.trim() === `\
@font-face { font-family: internal-keyframes; src: url("internal-keyframes.woff"); }`);
  assert(styleElems[5].textContent.trim() === `@font-face { font-family: neverused; src: url("neverused.woff"); }`);
  assert(styleElems[8].textContent.trim() === `@font-face { font-family: removed-internal; src: url("removed.woff"); }`);
  assert(styleElems[9].textContent.trim() === `@font-face { font-family: removed-keyframes; src: url("removed.woff"); }`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `@font-face { font-family: link; src: url("link.woff"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `@font-face { font-family: import; src: url("import.woff"); }`);
});

/**
 * Check syntax for used fonts
 *
 * capture.font = "save-used"
 */
it('test_capture_font_used_syntax', async function () {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/syntax/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('identifier-1.woff'));
  assert(zip.file('identifier-2.woff'));
  assert(zip.file('string-1.woff'));
  assert(zip.file('string-2.woff'));
  assert(zip.file('string-3.woff'));
  assert(zip.file('string-4.woff'));
  assert(zip.file('complex-name-1.woff'));
  assert(zip.file('complex-name-2.woff'));
  assert(zip.file('multiple-value-1.woff'));
  assert(zip.file('multiple-value-2.woff'));
  assert(zip.file('keyframes-1.woff'));
  assert(zip.file('keyframes-2.woff'));
  assert(zip.file('keyframes-3.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[1].textContent.trim() === `@font-face { font-family: identifier1; src: url("identifier-1.woff"); }`);
  assert(styleElems[2].textContent.trim() === `@font-face { font-family: identifier2; src: url("identifier-2.woff"); }`);
  assert(styleElems[3].textContent.trim() === `@font-face { font-family: "string1"; src: url("string-1.woff"); }`);
  assert(styleElems[4].textContent.trim() === `@font-face { font-family: "string2"; src: url("string-2.woff"); }`);
  assert(styleElems[5].textContent.trim() === `@font-face { font-family: "string3"; src: url("string-3.woff"); }`);
  assert(styleElems[6].textContent.trim() === `@font-face { font-family: "string 4"; src: url("string-4.woff"); }`);
  assert(styleElems[7].textContent.trim() === `@font-face { font-family: "complex \\\\\\"name\\\\\\" \\0A 1"; src: url("complex-name-1.woff"); }`);
  assert(styleElems[8].textContent.trim() === `@font-face { font-family: "complex \\\\'name\\\\' 2"; src: url("complex-name-2.woff"); }`);
  assert(styleElems[9].textContent.trim() === `\
@font-face { font-family: "multiple value 1"; src: url("multiple-value-1.woff"); }
@font-face { font-family: "multiple value 2"; src: url("multiple-value-2.woff"); }`);
  assert(styleElems[10].textContent.trim() === `\
@font-face { font-family: keyframes1; src: url("keyframes-1.woff"); }
@font-face { font-family: "keyframes 2"; src: url("keyframes-2.woff"); }
@font-face { font-family: "keyframes\\A 3"; src: url("keyframes-3.woff"); }

@keyframes keyframes1 {
  from { font-family: keyframes1, "keyframes 2"; }
  to { transform: translateX(40px); font-family: "keyframes\\A 3"; }
}`);
});

/**
 * Check handling of unloaded font files.
 *
 * capture.font = "save-used"
 */
it('test_capture_font_used_unloaded', async function () {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/unloaded/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('alternative-1.woff'));
  assert(zip.file('alternative-2.woff'));
  assert(zip.file('alternative-3.woff'));
  assert(zip.file('unicode-range-1.woff'));
  assert(zip.file('unicode-range-2.woff'));
  assert(zip.file('unicode-range-3.woff'));
  assert(zip.file('unicode-range-4.woff'));
  assert(zip.file('unicode-range-5.woff'));
  assert(zip.file('unicode-range-6.woff'));
  assert(zip.file('unicode-range-7.woff'));
  assert(zip.file('unicode-range-8.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assertEqual(
    doc.querySelector('style.alternative').textContent.trim(),
    `@font-face { font-family: alternative; src: url("alternative-1.woff"), url("alternative-2.woff"), url("alternative-3.woff"); }`,
  );
  assertEqual(
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

/**
 * Check if used fonts in scoped @font-face are handled correctly
 *
 * capture.font
 */
it('test_capture_font_used_scope', async function () {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/scope/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal1.woff'));
  assert(zip.file('internal2.woff'));
  assert(zip.file('internal3.woff'));
  assert(!zip.file('internal4.woff'));
  assert(zip.file('internal5.woff'));
  assert(zip.file('internal6.woff'));
  assert(zip.file('internal7.woff'));
  assert(!zip.file('internal8.woff'));
  assert(zip.file('shadow1.woff'));
  assert(zip.file('shadow2.woff'));
  assert(!zip.file('shadow3.woff'));
  assert(!zip.file('shadow4.woff'));
  assert(zip.file('shadow5.woff'));
  assert(zip.file('shadow6.woff'));
  assert(!zip.file('shadow7.woff'));
  assert(!zip.file('shadow8.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('style')[1].textContent.trim() === `\
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
  assert(shadow1.querySelectorAll('style')[1].textContent.trim() === `\
@font-face { font-family: local-upper-by-local-upper; src: url("shadow1.woff"); }
@font-face { font-family: local-upper-by-local; src: url("shadow2.woff"); }
@font-face { font-family: local-upper-by-upper; src: url(""); }
@font-face { font-family: local-upper-by-none; src: url(""); }
@font-face { font-family: local-by-local-upper; src: url("shadow5.woff"); }
@font-face { font-family: local-by-local; src: url("shadow6.woff"); }
@font-face { font-family: local-by-upper; src: url(""); }
@font-face { font-family: local-by-none; src: url(""); }`);
});

$it.skipIf($.noPartPseudo)('test_capture_font_used_scope_part', async function () {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/scope_part/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
@font-face { font-family: myff; src: url("internal.woff"); }
#shadow1::part(mypart) { font-family: myff; }`);
});

it('test_capture_font_used_scope_conditional', async function () {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/scope_conditional/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('internal.woff'));
  assert(zip.file('shadow.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `@font-face { font-family: myfont; src: url("internal.woff"); }`);

  var host1 = doc.querySelector('#shadow1');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelectorAll('style')[1].textContent.trim() === `\
@media print {
  @font-face { font-family: myfont; src: url("shadow.woff"); }
}`);
});

/**
 * Check used fonts referenced by CSS variable.
 *
 * capture.font = "save-used"
 */
$it.xfail()('test_capture_font_used_var', async function () {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/var/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('var1.woff'));  // @FIXME
  assert(zip.file('var2.woff'));  // @FIXME
  assert(zip.file('var3.woff'));  // @FIXME
  assert(zip.file('var4.woff'));  // @FIXME
  assert(zip.file('var5.woff'));  // @FIXME

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElems = doc.querySelectorAll('style');

  // @FIXME: font-face src emptied
  assert(styleElems[0].textContent.trim() === `\
@font-face { font-family: var1; src: url("var1.woff"); }
:root { --var-1: 1.1em var1; }
#var1 { font: var(--var-1); }`);

  // @FIXME: font-face src emptied
  assert(styleElems[1].textContent.trim() === `\
@font-face { font-family: var2; src: url("var2.woff"); }
:root { --var-2: var2; }
#var2 { font: 1.1em var(--var-2); }`);

  // @FIXME: font-face src emptied
  assert(styleElems[2].textContent.trim() === `\
@font-face { font-family: var3; src: url("var3.woff"); }
:root { --var-3: var3; }
#var3 { font-family: var(--var-3); font-size: 1.1em; }`);

  // @FIXME: font-face src emptied
  assert(styleElems[3].textContent.trim() === `\
@font-face { font-family: var4; src: url("var4.woff"); }
@keyframes anime4 {
  from { font-family: var(--var-4); font-size: 1.1em; }
  to { transform: translateX(40px); }
}
:root { --var-4: var4; }
#var4 { animation: anime4 3s linear infinite; }`);

  // @FIXME: font-face src emptied
  assert(styleElems[4].textContent.trim() === `\
@font-face { font-family: var5; src: url("var5.woff"); }
@keyframes anime5 {
  from { --var-5: var5; }
  to { transform: translateX(40px); }
}
#var5 { animation: anime5 3s linear infinite; font-family: var(--var-5); font-size: 1.1em; }`);
});

/**
 * Check if used fonts are checked correctly for nesting CSS.
 *
 * capture.font = "save-used"
 */
$it.skipIf($.noNestingCss)('test_capture_font_used_nesting', async function () {
  /* capture.font = save-used */
  var options = {
    "capture.font": "save-used",
    "capture.rewriteCss": "url",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/nesting/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('file1.woff'));
  assert(zip.file('file1-1.woff'));
  assert(zip.file('file1-1-1.woff'));
  assert(zip.file('file1-1-2.woff'));
  assert(!zip.file('file1-2.woff'));
  assert(!zip.file('file1-2-1.woff'));
  assert(!zip.file('file1-2-2.woff'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `\
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

/**
 * Check handling of fonts loaded by scripts.
 *
 * capture.font = "save-used"
 */
$it.xfail()('test_capture_font_used_scripted', async function () {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/scripted/index.html`,
    options: Object.assign({}, baseOptions, options),
  }, {delay: 300});
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('scripted.woff'));
  assert(!zip.file('removed.woff'));
});

/**
 * Check if option works
 *
 * capture.script
 */
it('test_capture_script', async function () {
  /* capture.script = save */
  var options = {
    "capture.script": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_script/script.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('script1.js'));
  assert(zip.file('script2.js'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var scripts = doc.querySelectorAll('script');
  assert(scripts[0].textContent.trim() === `console.log('head');`);
  assert(scripts[1].getAttribute('src') === `script1.js`);
  assert(scripts[2].getAttribute('src') === `script2.js`);
  assert(scripts[2].textContent.trim() === `console.log('head +src');`);
  assert(scripts[3].textContent.trim() === `console.log('body');`);
  assert(scripts[4].textContent.trim() === `console.log('post-body');`);
  assert(scripts[5].textContent.trim() === `console.log('post-html');`);
  var elem = doc.querySelector('a');
  assert(elem.getAttribute('href').trim() === `javascript:console.log('a');`);
  var elem = doc.body;
  assert(elem.getAttribute('onload').trim() === `console.log('load');`);
  assert(elem.getAttribute('oncontextmenu').trim() === `return false;`);
  var elem = doc.querySelector('div');
  assert(elem.getAttribute('onclick').trim() === `console.log('click');`);
  var elem = doc.querySelector('svg circle');
  assert(elem.getAttribute('onclick').trim() === `console.log('click');`);
  var elem = doc.querySelector('svg text');
  assert(elem.getAttribute('onclick').trim() === `console.log('click');`);
  var elem = doc.querySelector('math mrow');
  assert(elem.getAttribute('onclick').trim() === `console.log('click');`);

  /* capture.script = link */
  var options = {
    "capture.script": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_script/script.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var scripts = doc.querySelectorAll('script');
  assert(scripts[0].textContent.trim() === `console.log('head');`);
  assert(scripts[1].getAttribute('src') === `${localhost}/capture_script/script1.js`);
  assert(scripts[2].getAttribute('src') === `${localhost}/capture_script/script2.js`);
  assert(scripts[2].textContent.trim() === `console.log('head +src');`);
  assert(scripts[3].textContent.trim() === `console.log('body');`);
  assert(scripts[4].textContent.trim() === `console.log('post-body');`);
  assert(scripts[5].textContent.trim() === `console.log('post-html');`);
  var elem = doc.querySelector('a');
  assert(elem.getAttribute('href').trim() === `javascript:console.log('a');`);
  var elem = doc.body;
  assert(elem.getAttribute('onload').trim() === `console.log('load');`);
  assert(elem.getAttribute('oncontextmenu').trim() === `return false;`);
  var elem = doc.querySelector('div');
  assert(elem.getAttribute('onclick').trim() === `console.log('click');`);
  var elem = doc.querySelector('svg circle');
  assert(elem.getAttribute('onclick').trim() === `console.log('click');`);
  var elem = doc.querySelector('svg text');
  assert(elem.getAttribute('onclick').trim() === `console.log('click');`);
  var elem = doc.querySelector('math mrow');
  assert(elem.getAttribute('onclick').trim() === `console.log('click');`);

  /* capture.script = blank */
  var options = {
    "capture.script": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_script/script.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var scripts = doc.querySelectorAll('script');
  assert(scripts[0].textContent.trim() === ``);
  assert(!scripts[1].hasAttribute('src'));
  assert(!scripts[2].hasAttribute('src'));
  assert(scripts[2].textContent.trim() === ``);
  assert(scripts[3].textContent.trim() === ``);
  assert(scripts[4].textContent.trim() === ``);
  assert(scripts[5].textContent.trim() === ``);
  var elem = doc.querySelector('a');
  assert(elem.getAttribute('href').trim() === `javascript:`);
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

  /* capture.script = remove */
  var options = {
    "capture.script": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_script/script.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var scripts = doc.querySelectorAll('script');
  assert(scripts.length === 0);
  var elem = doc.querySelector('a');
  assert(elem.getAttribute('href').trim() === `javascript:`);
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

/**
 * Check if option works
 *
 * capture.noscript
 */
it('test_capture_noscript', async function () {
  /* capture.noscript = save */
  var options = {
    "capture.noscript": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_script/noscript.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('red.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var noscripts = doc.querySelectorAll('noscript');
  assert(noscripts[0].textContent.trim() === `Your browser does not support JavaScript.`);
  assert(noscripts[1].querySelector('img[src="red.bmp"]'));

  /* capture.noscript = blank */
  var options = {
    "capture.noscript": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_script/noscript.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var noscripts = doc.querySelectorAll('noscript');
  assert(noscripts[0].textContent === ``);
  assert(noscripts[1].innerHTML === ``);

  /* capture.noscript = remove */
  var options = {
    "capture.noscript": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_script/noscript.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var noscripts = doc.querySelectorAll('noscript');
  assert(noscripts.length === 0);
});

/**
 * Check if headless capture works
 *
 * capture.noscript
 */
it('test_capture_noscript_headless', async function () {
  var options = {
    "capture.noscript": "save",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_script/noscript.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('red.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var noscripts = doc.querySelectorAll('noscript');
  assert(noscripts[0].textContent.trim() === `Your browser does not support JavaScript.`);
  assert(noscripts[1].querySelector('img[src="red.bmp"]'));
});

/**
 * Check frame capture if same origin
 *
 * capture.frame
 */
it('test_capture_frame', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  options["capture.frame"]  = "save";

  var blob = await capture({
    url: `${localhost}/capture_frame/same_origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  // frame1.html
  var frame = frames[0];
  assert(frame.getAttribute('src') === `index_1.html`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  // frame2.xhtml
  var frame = frames[1];
  assert(frame.getAttribute('src') === `index_2.xhtml`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  // frame3.svg
  var frame = frames[2];
  assert(frame.getAttribute('src') === `index_3.svg`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost}/capture_frame/same_origin.html`);

  // text.txt
  var frame = frames[3];
  assert(frame.getAttribute('src') === 'text.txt');
  var frameFile = zip.file(frame.getAttribute('src'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");

  /* capture.frame = link */
  options["capture.frame"]  = "link";

  var blob = await capture({
    url: `${localhost}/capture_frame/same_origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  assert(frames[0].getAttribute('src') === `${localhost}/capture_frame/frames/frame1.html`);
  assert(frames[1].getAttribute('src') === `${localhost}/capture_frame/frames/frame2.xhtml`);
  assert(frames[2].getAttribute('src') === `${localhost}/capture_frame/frames/frame3.svg`);
  assert(frames[3].getAttribute('src') === `${localhost}/capture_frame/frames/text.txt`);

  /* capture.frame = blank */
  options["capture.frame"]  = "blank";

  var blob = await capture({
    url: `${localhost}/capture_frame/same_origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  assert(!frames[0].hasAttribute('src'));
  assert(!frames[1].hasAttribute('src'));
  assert(!frames[2].hasAttribute('src'));
  assert(!frames[3].hasAttribute('src'));

  /* capture.frame = remove */
  options["capture.frame"]  = "remove";

  var blob = await capture({
    url: `${localhost}/capture_frame/same_origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('iframe').length === 0);
});

/**
 * Check frame capture if cross origin
 *
 * capture.frame
 */
it('test_capture_frame_cross_origin', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  // Capture the frame content via content script and messaging.
  // The result should be same as same origin if it works normally.
  options["capture.frame"]  = "save";

  var blob = await capture({
    url: `${localhost}/capture_frame/cross_origin.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  // frame1.html
  var frame = frames[0];
  assert(frame.getAttribute('src') === `index_1.html`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  // frame2.xhtml
  var frame = frames[1];
  assert(frame.getAttribute('src') === `index_2.xhtml`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  // frame3.svg
  var frame = frames[2];
  assert(frame.getAttribute('src') === `index_3.svg`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost2}/capture_frame/same_origin.html`);

  // text.txt
  var frame = frames[3];
  assert(frame.getAttribute('src') === 'text.txt');
  var frameFile = zip.file(frame.getAttribute('src'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");

  /* capture.frame = link */
  // same as same origin

  /* capture.frame = blank */
  // same as same origin

  /* capture.frame = remove */
  // same as same origin
});

/**
 * Check frame capture if sandboxed
 *
 * capture.frame
 */
$it.xfailIf(
  userAgent.is('firefox') && userAgent.major < 128,
  'content script cannot be injected into a sandboxed iframe in Firefox < 128',
)('test_capture_frame_sandboxed', async function () {
  /* capture.frame = save */
  var options = {
    "capture.frame": "save",
    "capture.saveResourcesSequentially": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_frame/sandboxed.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  // frame1.html
  var indexFile = zip.file('index_1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assertEqual(doc.querySelector('p').textContent.trim(), `frame1 content modified`);
  assertEqual(doc.querySelector('img').getAttribute('src'), 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assertEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
});

$it.skipIf(
  !(userAgent.is('firefox') && userAgent.major < 128),
)('test_capture_frame_sandboxed_firefox_lt_128', async function () {
  /* capture.frame = save */
  var options = {
    "capture.frame": "save",
    "capture.saveResourcesSequentially": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_frame/sandboxed.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  // frame1.html
  var indexFile = zip.file('index_1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assertEqual(doc.querySelector('p').textContent.trim(), `frame1 content`);
  assertEqual(doc.querySelector('img').getAttribute('src'), 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assertEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
});

/**
 * Check frame capture for srcdoc
 *
 * capture.frame
 */
it('test_capture_frame_srcdoc', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  // srcdoc should be removed
  // otherwise same as same origin
  options["capture.frame"]  = "save";

  var blob = await capture({
    url: `${localhost}/capture_frame/srcdoc.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('iframe');
  assert(!frame.hasAttribute('srcdoc'));
  assert(frame.getAttribute('src') === `index_1.html`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
  assert(frameDoc.querySelector('p').textContent.trim() === `srcdoc content modified`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  // frame[srcdoc] should be ignored (left unchanged) and its src should be used
  //
  // In some browsers (e.g. Chromium 95), the frame loads an empty document when
  // "srcdoc" attribute exists. We skipped checking the captured document in
  // detail to prevent inconsistent results.
  var blob = await capture({
    url: `${localhost}/capture_frame/srcdoc_frame.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('frame');
  assert(frame.getAttribute('srcdoc').trim() === `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
  assert(frame.getAttribute('src') === `index_1.html`);

  /* capture.frame = link */
  // record resolved src and save rewritten srcdoc
  // resources in srcdoc should be saved as data URL
  options["capture.frame"]  = "link";

  var blob = await capture({
    url: `${localhost}/capture_frame/srcdoc.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('iframe');
  assert(frame.getAttribute('src') === `${localhost}/capture_frame/frames/frame1.html`);
  var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
  var srcdoc = await readFileAsDocument(srcdocBlob);

  assert(srcdoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
  assert(srcdoc.querySelector('p').textContent.trim() === `srcdoc content modified`);
  assert(srcdoc.querySelector('img').getAttribute('src') === 'data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
  assert(!zip.file('red.bmp'));

  // frame[srcdoc] should be ignored (left unchanged) and its src should be used
  var blob = await capture({
    url: `${localhost}/capture_frame/srcdoc_frame.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('frame');
  assert(frame.getAttribute('srcdoc').trim() === `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
  assert(frame.getAttribute('src') === `${localhost}/capture_frame/frames/frame1.html`);

  /* capture.frame = blank */
  // srcdoc should be removed
  options["capture.frame"]  = "blank";

  var blob = await capture({
    url: `${localhost}/capture_frame/srcdoc.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('iframe');
  assert(!frame.hasAttribute('src'));
  assert(!frame.hasAttribute('srcdoc'));

  // frame[srcdoc] should be ignored (left unchanged)
  var blob = await capture({
    url: `${localhost}/capture_frame/srcdoc_frame.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('frame');
  assert(frame.getAttribute('srcdoc').trim() === `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
  assert(!frame.hasAttribute('src'));

  /* capture.frame = remove */
  // same as same origin
});

/**
 * Check frame save for about: pages.
 *
 * capture.frame
 */
it('test_capture_frame_about', async function () {
  var options = {
    "capture.frame": "save",
    "capture.saveResourcesSequentially": true,
  };

  var blob = await capture({
    url: `${localhost}/capture_frame/about.html`,
    options: Object.assign({}, baseOptions, options),
  }, {delay: 300});

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  // @TODO:
  // Check only about:blank as the behavior of about: pages may vary across
  // browsers.
  // - e.g. Firefox 123: contentDocument of about:blank?query is not accessible.
  assert(frames[0].getAttribute('src') === "index_1.html");
  assert(frames[1].getAttribute('src') === "index_2.html");

  var indexFile = zip.file('index_1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.body.textContent.trim() === 'iframe modified 1');

  var indexFile = zip.file('index_2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.body.textContent.trim() === 'iframe modified 2');
});

/**
 * Check duplication and hash handling
 *
 * capture.frame
 */
it('test_capture_frame_duplicate', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  options["capture.frame"]  = "save";

  var blob = await capture({
    url: `${localhost}/capture_frame/duplicate.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  assert(frames[0].getAttribute('src') === `index_1.html`);
  assert(frames[1].getAttribute('src') === `index_2.html`);
  assert(frames[2].getAttribute('src') === `index_3.html#abc`);
  assert(frames[3].getAttribute('src') === `text.txt`);
  assert(frames[4].getAttribute('src') === `text.txt`);

  /* capture.frame = link */
  options["capture.frame"]  = "link";

  var blob = await capture({
    url: `${localhost}/capture_frame/duplicate.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  assert(frames[0].getAttribute('src') === `${localhost}/capture_frame/frames/frame1.html`);
  assert(frames[1].getAttribute('src') === `${localhost}/capture_frame/frames/frame1.html`);
  assert(frames[2].getAttribute('src') === `${localhost}/capture_frame/frames/frame1.html#abc`);
  assert(frames[3].getAttribute('src') === `${localhost}/capture_frame/frames/text.txt`);
  assert(frames[4].getAttribute('src') === `${localhost}/capture_frame/frames/text.txt`);
});

/**
 * Check headless frame save if same origin
 *
 * capture.frame
 */
it('test_capture_frame_headless', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  // frame contents are source (not modified by scripts) due to headless capture
  options["capture.frame"]  = "save";

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/same_origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  var frame = frames[0];
  assert(frame.getAttribute('src') === `index_1.html`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  var frame = frames[1];
  assert(frame.getAttribute('src') === `index_2.xhtml`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var frame = frames[2];
  assert(frame.getAttribute('src') === `index_3.svg`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost}/capture_frame/same_origin.html`);

  var frame = frames[3];
  assert(frame.getAttribute('src') === 'text.txt');
  var frameFile = zip.file(frame.getAttribute('src'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
});

/**
 * Check headless frame save for srcdoc
 *
 * capture.frame
 */
it('test_capture_frame_headless_srcdoc', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  // srcdoc content should be rewritten
  options["capture.frame"]  = "save";

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/srcdoc.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('iframe');
  assert(!frame.hasAttribute('srcdoc'));
  assert(frame.getAttribute('src') === `index_1.html`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
  assert(frameDoc.querySelector('p').textContent.trim() === `srcdoc content`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  // meta refresh in the srcdoc should be resolved according to the base URL of the main document
  var frame = doc.querySelectorAll('iframe')[1];
  assert(!frame.hasAttribute('srcdoc'));
  assert(frame.getAttribute('src') === `index_2.html`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
  var mrs = frameDoc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `0; url=${localhost}/capture_frame/frames/frame1.html`);

  // frame[srcdoc] should be ignored (left unchanged) and its src should be used
  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/srcdoc_frame.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelectorAll('frame')[0];
  assert(frame.getAttribute('srcdoc').trim() === `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
  assert(frame.getAttribute('src') === `index_1.html`);

  /* capture.frame = link */
  // record resolved src and save rewritten srcdoc
  // resources in srcdoc should be saved as data URL
  options["capture.frame"]  = "link";

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/srcdoc.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('iframe');
  assert(frame.getAttribute('src') === `${localhost}/capture_frame/frames/frame1.html`);
  var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
  var srcdoc = await readFileAsDocument(srcdocBlob);

  assert(srcdoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
  assert(srcdoc.querySelector('p').textContent.trim() === `srcdoc content`);
  assert(srcdoc.querySelector('img').getAttribute('src') === 'data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
  assert(!zip.file('red.bmp'));

  // meta refresh in the srcdoc should be resolved according to the base URL of the main document
  var frame = doc.querySelectorAll('iframe')[1];
  var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
  var srcdoc = await readFileAsDocument(srcdocBlob);

  assert(srcdoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
  var mrs = frameDoc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `0; url=${localhost}/capture_frame/frames/frame1.html`);

  // frame[srcdoc] should be ignored (left unchanged) and its src should be used
  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/srcdoc_frame.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelectorAll('frame')[0];
  assert(frame.getAttribute('srcdoc').trim() === `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
  assert(frame.getAttribute('src') === `${localhost}/capture_frame/frames/frame1.html`);
});

/**
 * Check headless frame save for about: pages.
 *
 * capture.frame
 */
it('test_capture_frame_headless_about', async function () {
  var options = {
    "capture.frame": "save",
    "capture.saveResourcesSequentially": true,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/about.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');
  assert(frames[0].getAttribute('src') === "about:blank");
  assert(frames[1].getAttribute('src') === "about:blank");
  assert(frames[2].getAttribute('src') === "about:blank?foo=bar");
  assert(frames[3].getAttribute('src') === "about:blank?foo=bar#frag");
  assert(frames[4].getAttribute('src') === "about:srcdoc");
  assert(frames[5].getAttribute('src') === "about:invalid");
  assert(frames[6].getAttribute('src') === "about:newtab");
  assert(frames[7].getAttribute('src') === "about:unknown");
});

/**
 * Check headless frame capture if point to self
 *
 * capture.frame
 */
it('test_capture_frame_headless_self', async function () {
  /* capture.frame = save */
  var options = {
    "capture.frame": "save",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/self.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  assert(!frames[0].hasAttribute('src'));
  assert(frames[1].getAttribute('src') === "");
  assert(frames[2].getAttribute('src') === "#123");
  assert(frames[3].getAttribute('src') === "index.html");
});

/**
 * Check duplication and hash handling
 *
 * capture.frame
 */
it('test_capture_frame_headless_duplicate', async function () {
  /* capture.frame = save */
  var options = {
    "capture.frame": "save",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/duplicate.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  assert(frames[0].getAttribute('src') === "index_1.html");
  assert(frames[1].getAttribute('src') === "index_1.html");
  assert(frames[2].getAttribute('src') === "index_1.html#abc");
  assert(frames[3].getAttribute('src') === "text.txt");
  assert(frames[4].getAttribute('src') === "text.txt");
});

/**
 * Check data URI output for frame capture.
 *
 * - Use original filename.
 *
 * capture.frame
 * capture.saveDataUriAsSrcdoc
 */
it('test_capture_frame_singleHtml', async function () {
  /* capture.saveDataUriAsSrcdoc = true */
  // data URI charset should be UTF-8
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.frame": "save",
    "capture.saveDataUriAsSrcdoc": true,
  };

  var blob = await capture({
    url: `${localhost}/capture_frame/same_origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('iframe');

  var frameSrc = `data:text\/html;charset=UTF-8,${encodeURIComponent(frames[0].getAttribute('srcdoc'))}`;
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);

  var frameSrc = frames[1].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:application/xhtml+xml;charset=UTF-8;filename=frame2.xhtml,`));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);

  var frameSrc = frames[2].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:image/svg+xml;charset=UTF-8;filename=frame3.svg,`));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost}/capture_frame/same_origin.html`);

  var frameSrc = frames[3].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:text/plain;filename=text.txt,`));
  var text = (await xhr({url: frameSrc, responseType: "text"})).response;
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");

  // <frame> does not support srcdoc and should use data URL
  var blob = await capture({
    url: `${localhost}/capture_frame/frameset.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('frame');

  var frameSrc = frames[0].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame1.html,`));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);

  var frameSrc = frames[1].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:application/xhtml+xml;charset=UTF-8;filename=frame2.xhtml,`));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);

  /* capture.saveDataUriAsSrcdoc = false */
  // data URI charset should be UTF-8
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.frame": "save",
    "capture.saveDataUriAsSrcdoc": false,
  };

  var blob = await capture({
    url: `${localhost}/capture_frame/same_origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('iframe');

  var frameSrc = frames[0].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame1.html,`));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);

  var frameSrc = frames[1].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:application/xhtml+xml;charset=UTF-8;filename=frame2.xhtml,`));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);

  var frameSrc = frames[2].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:image/svg+xml;charset=UTF-8;filename=frame3.svg,`));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost}/capture_frame/same_origin.html`);

  var frameSrc = frames[3].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:text/plain;filename=text.txt,`));
  var text = (await xhr({url: frameSrc, responseType: "text"})).response;
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");

  // <frame> does not support srcdoc and should use data URL
  var blob = await capture({
    url: `${localhost}/capture_frame/frameset.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('frame');

  var frameSrc = frames[0].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame1.html,`));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);

  var frameSrc = frames[1].getAttribute('src');
  assert(frameSrc.match(rawRegex`${'^'}data:application/xhtml+xml;charset=UTF-8;filename=frame2.xhtml,`));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);
});

/**
 * Check data URI output for duplicated references
 *
 * - Filename parameter of data URL should not be uniquified.
 * - data URL should not contain a hash.
 *
 * capture.frame
 */
it('test_capture_frame_singleHtml_duplicate', async function () {
  /* capture.saveDataUriAsSrcdoc = true */
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.frame": "save",
    "capture.saveDataUriAsSrcdoc": true,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/duplicate.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('iframe');

  assert(frames[0].getAttribute('srcdoc') === frames[1].getAttribute('srcdoc'));
  assert(frames[0].getAttribute('srcdoc') === frames[2].getAttribute('srcdoc'));
  assert(frames[3].getAttribute('srcdoc') === frames[4].getAttribute('srcdoc'));

  /* capture.saveDataUriAsSrcdoc = false */
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.frame": "save",
    "capture.saveDataUriAsSrcdoc": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/duplicate.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('iframe');

  assert(frames[0].getAttribute('src') === frames[1].getAttribute('src'));
  assert(frames[0].getAttribute('src') === frames[2].getAttribute('src'));
  assert(frames[3].getAttribute('src') === frames[4].getAttribute('src'));
});

/**
 * Check if circular frame referencing is handled correctly
 *
 * capture.frame
 */
it('test_capture_frame_circular', async function () {
  /* capture.saveAs = zip */
  // link to corresponding downloaded frame file
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "zip",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // frame1.html
  var frame = doc.querySelector('iframe');
  var frameSrc = frame.getAttribute('src');
  assert(frameSrc === 'index_1.html');
  var frameFile = zip.file(frameSrc);
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  // frame2.html
  var frame = frameDoc.querySelector('iframe');
  var frameSrc = frame.getAttribute('src');
  assert(frameSrc === 'index_2.html');
  var frameFile = zip.file(frameSrc);
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  // index.html
  var frame = frameDoc.querySelector('iframe');
  var frameSrc = frame.getAttribute('src');
  assert(frameSrc === 'index.html');

  /* capture.saveAs = singleHtml; srcdoc = true */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "singleHtml",
    "capture.saveDataUriAsSrcdoc": true,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(frame.getAttribute('src') === `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular/index.html`);
  assert(!frame.hasAttribute('srcdoc'));

  /* capture.saveAs = singleHtml; srcdoc = false */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "singleHtml",
    "capture.saveDataUriAsSrcdoc": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(frame.getAttribute('src') === `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular/index.html`);
  assert(!frame.hasAttribute('srcdoc'));
});

/**
 * Check if self-pointing circular frame referencing is handled correctly
 *
 * capture.frame
 */
it('test_capture_frame_circular_self', async function () {
  /* capture.frame = save */
  // link to corresponding downloaded frame file
  var options = {
    "capture.frame": "save",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular_self/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('iframe');
  var frameSrc = frame.getAttribute('src');
  assert(frameSrc === 'index.html');

  /* capture.saveAs = singleHtml; srcdoc = true */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "singleHtml",
    "capture.saveDataUriAsSrcdoc": true,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular_self/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  var frame = doc.querySelector('iframe');
  assert(frame.getAttribute('src') === `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular_self/index.html`);
  assert(!frame.hasAttribute('srcdoc'));

  /* capture.saveAs = singleHtml; srcdoc = false */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "singleHtml",
    "capture.saveDataUriAsSrcdoc": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular_self/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  var frame = doc.querySelector('iframe');
  assert(frame.getAttribute('src') === `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular_self/index.html`);
  assert(!frame.hasAttribute('srcdoc'));
});

/**
 * Check if frameRename works correctly.
 *
 * capture.frameRename
 */
it('test_capture_frameRename', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frameRename = true */
  Object.assign(options, {
    "capture.frameRename": true,
    "capture.frame": "save",
  });

  var blob = await capture({
    url: `${localhost}/capture_frameRename/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.xhtml`);
  assert(doc.querySelectorAll('iframe')[2].getAttribute('src') === `index_3.svg`);
  assert(doc.querySelectorAll('iframe')[3].getAttribute('src') === `text.txt`);
  assert(doc.querySelectorAll('iframe')[4].getAttribute('src') === `red.bmp`);

  /* capture.frameRename = false */
  Object.assign(options, {
    "capture.frameRename": false,
    "capture.frame": "save",
  });

  var blob = await capture({
    url: `${localhost}/capture_frameRename/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `frame1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `frame2.xhtml`);
  assert(doc.querySelectorAll('iframe')[2].getAttribute('src') === `frame3.svg`);
  assert(doc.querySelectorAll('iframe')[3].getAttribute('src') === `text.txt`);
  assert(doc.querySelectorAll('iframe')[4].getAttribute('src') === `red.bmp`);
});

/**
 * Check if header filename is taken for frameRename
 *
 * capture.frameRename
 */
it('test_capture_frameRename_header', async function () {
  /* capture.frameRename = false */
  var options = {
    "capture.frame": "save",
    "capture.frameRename": false,
  };

  var blob = await capture({
    url: `${localhost}/capture_frameRename_header/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(zip.file("frame1.html"));
  assert(zip.file("frame2.html"));
  assert(zip.file("frame3.py.html"));
  assert(zip.file("a中b#c.php.html"));

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `frame1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `frame2.html`);
  assert(doc.querySelectorAll('iframe')[2].getAttribute('src') === `frame3.py.html`);
  assert(doc.querySelectorAll('iframe')[3].getAttribute('src') === `a中b%23c.php.html`);

  /* capture.frameRename = false; headless */
  var options = {
    "capture.frame": "save",
    "capture.frameRename": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frameRename_header/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(zip.file("frame1.html"));
  assert(zip.file("frame2.html"));
  assert(zip.file("frame3.py.html"));
  assert(zip.file("a中b#c.php.html"));

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `frame1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `frame2.html`);
  assert(doc.querySelectorAll('iframe')[2].getAttribute('src') === `frame3.py.html`);
  assert(doc.querySelectorAll('iframe')[3].getAttribute('src') === `a中b%23c.php.html`);

  /* capture.saveAs = singleHtml; srcdoc = false */
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "singleHtml",
    "capture.saveDataUriAsSrcdoc": false,
  };

  var blob = await capture({
    url: `${localhost}/capture_frameRename_header/index.html`,
    options: Object.assign({}, baseOptions, options),
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

  /* capture.saveAs = singleHtml; srcdoc = false; headless */
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "singleHtml",
    "capture.saveDataUriAsSrcdoc": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frameRename_header/index.html`,
    options: Object.assign({}, baseOptions, options),
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

/**
 * Check if the URL in an anchor (link) is rewritten correctly
 *
 * capturer.captureDocument
 */
it('test_capture_anchor_basic', async function () {
  var blob = await capture({
    url: `${localhost}/capture_anchor/basic/basic.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var anchors = doc.querySelectorAll('a');

  assertEqual(anchors[0].getAttribute('href'), ``);
  assertEqual(anchors[1].getAttribute('href'), `#`);
  assertEqual(anchors[2].getAttribute('href'), `#123`);
  assertEqual(anchors[3].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?`);
  assertEqual(anchors[4].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?id=123`);
  assertEqual(anchors[5].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?id=123#456`);

  assertEqual(anchors[6].getAttribute('href'), ``);
  assertEqual(anchors[7].getAttribute('href'), `#`);
  assertEqual(anchors[8].getAttribute('href'), `#123`);
  assertEqual(anchors[9].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?`);
  assertEqual(anchors[10].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?id=123`);
  assertEqual(anchors[11].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?id=123#456`);

  assertEqual(anchors[12].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html`);
  assertEqual(anchors[13].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html#`);
  assertEqual(anchors[14].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html#123`);
  assertEqual(anchors[15].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html?`);
  assertEqual(anchors[16].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html?id=123`);
  assertEqual(anchors[17].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html?id=123#456`);

  assertEqual(anchors[18].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html`);
  assertEqual(anchors[19].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html#`);
  assertEqual(anchors[20].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html#123`);
  assertEqual(anchors[21].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html?`);
  assertEqual(anchors[22].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html?id=123`);
  assertEqual(anchors[23].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html?id=123#456`);

  assertEqual(anchors[24].getAttribute('href'), `http://example.com/`); // fixed from http://example.com
  assertEqual(anchors[25].getAttribute('href'), `http://example.com/#`);
  assertEqual(anchors[26].getAttribute('href'), `http://example.com/#123`);
  assertEqual(anchors[27].getAttribute('href'), `http://example.com/?`);
  assertEqual(anchors[28].getAttribute('href'), `http://example.com/?id=123`);
  assertEqual(anchors[29].getAttribute('href'), `http://example.com/?id=123#456`);

  assertEqual(anchors[30].getAttribute('href'), `about:blank`);
  assertEqual(anchors[31].getAttribute('href'), `about:blank#`);
  assertEqual(anchors[32].getAttribute('href'), `about:blank#123`);
  assertEqual(anchors[33].getAttribute('href'), `about:blank?`);
  assertEqual(anchors[34].getAttribute('href'), `about:blank?id=123`);
  assertEqual(anchors[35].getAttribute('href'), `about:blank?id=123#456`);

  assertEqual(anchors[36].getAttribute('href'), `urn:scrapbook:download:error:http://example.com`);
  assertEqual(anchors[37].getAttribute('href'), `urn:scrapbook:download:error:http://example.com#`);
  assertEqual(anchors[38].getAttribute('href'), `urn:scrapbook:download:error:http://example.com#123`);
  assertEqual(anchors[39].getAttribute('href'), `urn:scrapbook:download:error:http://example.com?`);
  assertEqual(anchors[40].getAttribute('href'), `urn:scrapbook:download:error:http://example.com?id=123`);
  assertEqual(anchors[41].getAttribute('href'), `urn:scrapbook:download:error:http://example.com?id=123#456`);

  assertEqual(anchors[42].getAttribute('href'), `mailto:noresponse@example.com`);
});

/**
 * Check local selection
 * a hash URL pointing to a non-captured part of self page should be resolved to original page
 *
 * capturer.captureDocument
 */
it('test_capture_anchor_partial', async function () {
  /* hash link target not captured */
  var blob = await capture({
    url: `${localhost}/capture_anchor/partial_noncaptured/partial.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var anchors = doc.querySelectorAll('a');

  assertEqual(anchors[0].getAttribute('href'), ``);
  assertEqual(anchors[1].getAttribute('href'), `#`);
  assertEqual(anchors[2].getAttribute('href'), `${localhost}/capture_anchor/partial_noncaptured/partial.html#target_id`);
  assertEqual(anchors[3].getAttribute('href'), `${localhost}/capture_anchor/partial_noncaptured/partial.html#target_name`);

  assertEqual(anchors[4].getAttribute('href'), ``);
  assertEqual(anchors[5].getAttribute('href'), `#`);
  assertEqual(anchors[6].getAttribute('href'), `${localhost}/capture_anchor/partial_noncaptured/partial.html#target_id`);
  assertEqual(anchors[7].getAttribute('href'), `${localhost}/capture_anchor/partial_noncaptured/partial.html#target_name`);

  /* hash link target captured */
  var blob = await capture({
    url: `${localhost}/capture_anchor/partial/partial.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var anchors = doc.querySelectorAll('a');

  assertEqual(anchors[0].getAttribute('href'), ``);
  assertEqual(anchors[1].getAttribute('href'), `#`);
  assertEqual(anchors[2].getAttribute('href'), `#target_id`);
  assertEqual(anchors[3].getAttribute('href'), `#target_name`);

  assertEqual(anchors[4].getAttribute('href'), ``);
  assertEqual(anchors[5].getAttribute('href'), `#`);
  assertEqual(anchors[6].getAttribute('href'), `#target_id`);
  assertEqual(anchors[7].getAttribute('href'), `#target_name`);
});

/**
 * Check anchors handling in iframe[srcdoc].
 *
 * capturer.captureDocument
 */
it('test_capture_anchor_srcdoc', async function () {
  /* depth = null */
  // Links to the original page should be rewritten to the captured one,
  // but it's over-complicated to do so for a non-indepth capture.
  // Link to the original URL instead.
  var options = {
    "capture.downLink.doc.depth": null,
  };
  var blob = await capture({
    url: `${localhost}/capture_anchor/srcdoc/srcdoc.html`,
    options: Object.assign({}, baseOptions, options),
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

  assertEqual(anchors[0].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html`);
  assertEqual(anchors[1].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html#`);
  assertEqual(anchors[2].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html#123`);
  assertEqual(anchors[3].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?`);
  assertEqual(anchors[4].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?id=123`);

  assertEqual(anchors[5].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html`);
  assertEqual(anchors[6].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html#`);
  assertEqual(anchors[7].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html#123`);
  assertEqual(anchors[8].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?`);
  assertEqual(anchors[9].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?id=123`);

  assertEqual(anchors[10].getAttribute('href'), `about:srcdoc`);

  /* depth = 0 */
  // links to the original page should be rewritten to be the captured one
  var options = {
    "capture.downLink.doc.depth": 0,
  };
  var blob = await capture({
    url: `${localhost}/capture_anchor/srcdoc/srcdoc.html`,
    options: Object.assign({}, baseOptions, options),
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

  assertEqual(anchors[0].getAttribute('href'), `index.html`);
  assertEqual(anchors[1].getAttribute('href'), `index.html#`);
  assertEqual(anchors[2].getAttribute('href'), `index.html#123`);
  assertEqual(anchors[3].getAttribute('href'), `index.html`);  // "srcdoc.html?" is normalized to "srcdoc.html"
  assertEqual(anchors[4].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?id=123`);

  assertEqual(anchors[5].getAttribute('href'), `index.html`);
  assertEqual(anchors[6].getAttribute('href'), `index.html#`);
  assertEqual(anchors[7].getAttribute('href'), `index.html#123`);
  assertEqual(anchors[8].getAttribute('href'), `index.html`);  // "srcdoc.html?" is normalized to "srcdoc.html"
  assertEqual(anchors[9].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?id=123`);

  assertEqual(anchors[10].getAttribute('href'), `about:srcdoc`);
});

/**
 * Check when base is set to another page
 *
 * capturer.captureDocument
 */
it('test_capture_anchor_base', async function () {
  var blob = await capture({
    url: `${localhost}/capture_anchor/base/base.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var anchors = doc.querySelectorAll('a');

  assertEqual(anchors[0].getAttribute('href'), `${localhost}/capture_anchor/base/subdir/linked.html`);
  assertEqual(anchors[1].getAttribute('href'), `${localhost}/capture_anchor/base/subdir/linked.html#`);
  assertEqual(anchors[2].getAttribute('href'), `${localhost}/capture_anchor/base/subdir/linked.html#123`);
  assertEqual(anchors[3].getAttribute('href'), `${localhost}/capture_anchor/base/subdir/linked.html?id=123`);

  assertEqual(anchors[4].getAttribute('href'), ``);
  assertEqual(anchors[5].getAttribute('href'), `#`);
  assertEqual(anchors[6].getAttribute('href'), `#123`);
  assertEqual(anchors[7].getAttribute('href'), `${localhost}/capture_anchor/base/base.html?id=123`);

  assertEqual(anchors[8].getAttribute('href'), `http://example.com/`); // slight changed from http://example.com
});

/**
 * Check if option works
 *
 * capture.ping
 */
it('test_capture_anchor_ping', async function () {
  /* capture.ping = link */
  var options = {
    "capture.ping": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_anchor/ping/ping.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var a = doc.querySelector('a');

  assertEqual(a.getAttribute('ping'), `${localhost}/capture_anchor/ping/ping.py ${localhost}/capture_anchor/ping/ping2.py`);

  /* capture.ping = blank */
  var options = {
    "capture.ping": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_anchor/ping/ping.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var a = doc.querySelector('a');

  assertEqual(a.hasAttribute('ping'), false);
});

/**
 * Check if option works
 *
 * capture.image
 */
it('test_capture_image', async function () {
  /* capture.image = save */
  var options = {
    "capture.image": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/image.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('red.bmp'));
  assert(zip.file('green.bmp'));
  assert(zip.file('blue.bmp'));
  assert(zip.file('yellow.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `red.bmp`);
  assert(imgs[1].getAttribute('srcset') === `red.bmp`);
  assert(imgs[2].getAttribute('src') === `red.bmp`);
  assert(imgs[2].getAttribute('srcset') === `green.bmp 2x, blue.bmp 3x, yellow.bmp 4x`);
  assert(imgs[3].getAttribute('src') === `red.bmp`);
  assert(imgs[3].getAttribute('srcset') === `green.bmp 120w, blue.bmp 180w, yellow.bmp 240w`);
  var picture = doc.querySelector('picture');
  var sources = picture.querySelectorAll('source');
  assert(sources[0].getAttribute('srcset') === `green.bmp`);
  assert(sources[1].getAttribute('srcset') === `blue.bmp`);
  var imgs = picture.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `red.bmp`);
  var input = doc.querySelector('input');
  assert(input.getAttribute('src') === `red.bmp`);

  /* capture.image = save-current */
  var options = {
    "capture.image": "save-current",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/image.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length > 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `red.bmp`);
  assert(imgs[1].getAttribute('src') === `red.bmp`);
  assert(!imgs[1].hasAttribute('srcset'));
  assert(imgs[2].getAttribute('src') === `red.bmp`
      || imgs[2].getAttribute('src') === `green.bmp`
      || imgs[2].getAttribute('src') === `blue.bmp`
      || imgs[2].getAttribute('src') === `yellow.bmp`);
  assert(!imgs[2].hasAttribute('srcset'));
  assert(imgs[3].getAttribute('src') === `red.bmp`
      || imgs[3].getAttribute('src') === `green.bmp`
      || imgs[3].getAttribute('src') === `blue.bmp`
      || imgs[3].getAttribute('src') === `yellow.bmp`);
  assert(!imgs[3].hasAttribute('srcset'));
  var picture = doc.querySelector('picture');
  assert(picture.querySelectorAll('source').length === 0);
  var imgs = picture.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `red.bmp`
      || imgs[0].getAttribute('src') === `green.bmp`
      || imgs[0].getAttribute('src') === `blue.bmp`);
  assert(!imgs[0].hasAttribute('srcset'));
  var input = doc.querySelector('input');
  assert(input.getAttribute('src') === `red.bmp`);

  /* capture.image = save-current (headless) */
  // the result is same as save
  var options = {
    "capture.image": "save-current",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_image/image.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('red.bmp'));
  assert(zip.file('green.bmp'));
  assert(zip.file('blue.bmp'));
  assert(zip.file('yellow.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `red.bmp`);
  assert(imgs[1].getAttribute('srcset') === `red.bmp`);
  assert(imgs[2].getAttribute('src') === `red.bmp`);
  assert(imgs[2].getAttribute('srcset') === `green.bmp 2x, blue.bmp 3x, yellow.bmp 4x`);
  assert(imgs[3].getAttribute('src') === `red.bmp`);
  assert(imgs[3].getAttribute('srcset') === `green.bmp 120w, blue.bmp 180w, yellow.bmp 240w`);
  var picture = doc.querySelector('picture');
  var sources = picture.querySelectorAll('source');
  assert(sources[0].getAttribute('srcset') === `green.bmp`);
  assert(sources[1].getAttribute('srcset') === `blue.bmp`);
  var imgs = picture.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `red.bmp`);
  var input = doc.querySelector('input');
  assert(input.getAttribute('src') === `red.bmp`);

  /* capture.image = link */
  var options = {
    "capture.image": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/image.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `${localhost}/capture_image/red.bmp`);
  assert(imgs[1].getAttribute('srcset') === `${localhost}/capture_image/red.bmp`);
  assert(imgs[2].getAttribute('src') === `${localhost}/capture_image/red.bmp`);
  assert(imgs[2].getAttribute('srcset') === `${localhost}/capture_image/green.bmp 2x, ${localhost}/capture_image/blue.bmp 3x, ${localhost}/capture_image/yellow.bmp 4x`);
  assert(imgs[3].getAttribute('src') === `${localhost}/capture_image/red.bmp`);
  assert(imgs[3].getAttribute('srcset') === `${localhost}/capture_image/green.bmp 120w, ${localhost}/capture_image/blue.bmp 180w, ${localhost}/capture_image/yellow.bmp 240w`);
  var picture = doc.querySelector('picture');
  var sources = picture.querySelectorAll('source');
  assert(sources[0].getAttribute('srcset') === `${localhost}/capture_image/green.bmp`);
  assert(sources[1].getAttribute('srcset') === `${localhost}/capture_image/blue.bmp`);
  var imgs = picture.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `${localhost}/capture_image/red.bmp`);
  var input = doc.querySelector('input');
  assert(input.getAttribute('src') === `${localhost}/capture_image/red.bmp`);

  /* capture.image = blank */
  var options = {
    "capture.image": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/image.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `about:blank`);
  assert(!imgs[1].hasAttribute('srcset'));
  assert(imgs[2].getAttribute('src') === `about:blank`);
  assert(!imgs[2].hasAttribute('srcset'));
  assert(imgs[3].getAttribute('src') === `about:blank`);
  assert(!imgs[3].hasAttribute('srcset'));
  var picture = doc.querySelector('picture');
  var sources = picture.querySelectorAll('source');
  assert(!sources[0].hasAttribute('srcset'));
  assert(!sources[1].hasAttribute('srcset'));
  var imgs = picture.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === `about:blank`);
  var input = doc.querySelector('input');
  assert(input.getAttribute('src') === `about:blank`);

  /* capture.image = remove */
  var options = {
    "capture.image": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/image.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('img').length === 0);
  assert(doc.querySelectorAll('picture').length === 0);
  assert(doc.querySelectorAll('input').length === 0);
});

/**
 * Check if option works
 *
 * capture.audio
 */
it('test_capture_audio', async function () {
  // Use headless for most test cases since loading audio in the browser is slow.

  /* capture.audio = save (headless) */
  var options = {
    "capture.audio": "save",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_audio/audio.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('horse.ogg'));
  assert(zip.file('horse.mp3'));
  assert(zip.file('horse_en.vtt'));
  assert(zip.file('horse_zh.vtt'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var audioElems = doc.querySelectorAll('audio');
  assert(audioElems[0].getAttribute('src') === `horse.mp3`);
  var sourceElems = audioElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `horse.ogg`);
  assert(sourceElems[1].getAttribute('src') === `horse.mp3`);
  var trackElems = audioElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `horse_en.vtt`);
  assert(trackElems[1].getAttribute('src') === `horse_zh.vtt`);

  /* capture.audio = save-current */
  var options = {
    "capture.audio": "save-current",
  };
  var blob = await capture({
    url: `${localhost}/capture_audio/audio.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length > 1);
  assert(zip.file('horse_en.vtt'));
  assert(zip.file('horse_zh.vtt'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var audioElems = doc.querySelectorAll('audio');
  assert(audioElems[0].getAttribute('src') === `horse.mp3`);
  assert(audioElems[1].getAttribute('src') === `horse.ogg`
      || audioElems[1].getAttribute('src') === `horse.mp3`);
  var sourceElems = audioElems[1].querySelectorAll('source');
  assert(sourceElems.length === 0);
  var trackElems = audioElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `horse_en.vtt`);
  assert(trackElems[1].getAttribute('src') === `horse_zh.vtt`);

  /* capture.audio = save-current (headless) */
  // the result is same as save
  var options = {
    "capture.audio": "save-current",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_audio/audio.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('horse.ogg'));
  assert(zip.file('horse.mp3'));
  assert(zip.file('horse_en.vtt'));
  assert(zip.file('horse_zh.vtt'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var audioElems = doc.querySelectorAll('audio');
  assert(audioElems[0].getAttribute('src') === `horse.mp3`);
  var sourceElems = audioElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `horse.ogg`);
  assert(sourceElems[1].getAttribute('src') === `horse.mp3`);
  var trackElems = audioElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `horse_en.vtt`);
  assert(trackElems[1].getAttribute('src') === `horse_zh.vtt`);

  /* capture.audio = link (headless) */
  var options = {
    "capture.audio": "link",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_audio/audio.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var audioElems = doc.querySelectorAll('audio');
  assert(audioElems[0].getAttribute('src') === `${localhost}/capture_audio/horse.mp3`);
  var sourceElems = audioElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `${localhost}/capture_audio/horse.ogg`);
  assert(sourceElems[1].getAttribute('src') === `${localhost}/capture_audio/horse.mp3`);
  var trackElems = audioElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `${localhost}/capture_audio/horse_en.vtt`);
  assert(trackElems[1].getAttribute('src') === `${localhost}/capture_audio/horse_zh.vtt`);

  /* capture.audio = blank (headless) */
  var options = {
    "capture.audio": "blank",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_audio/audio.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var audioElems = doc.querySelectorAll('audio');
  assert(audioElems[0].getAttribute('src') === `about:blank`);
  var sourceElems = audioElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `about:blank`);
  assert(sourceElems[1].getAttribute('src') === `about:blank`);
  var trackElems = audioElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `about:blank`);
  assert(trackElems[1].getAttribute('src') === `about:blank`);

  /* capture.audio = remove (headless) */
  var options = {
    "capture.audio": "remove",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_audio/audio.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var audioElems = doc.querySelectorAll('audio');
  assert(audioElems.length === 0);
  var sourceElems = doc.querySelectorAll('source');
  assert(sourceElems.length === 0);
  var trackElems = doc.querySelectorAll('track');
  assert(trackElems.length === 0);
});

/**
 * Check if option works
 *
 * capture.video
 */
it('test_capture_video', async function () {
  // Use headless for most test cases since loading video in the browser is slow.

  /* capture.video = save (headless) */
  var options = {
    "capture.video": "save",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_video/video.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('small.mp4'));
  assert(zip.file('small.webm'));
  assert(zip.file('small_en.vtt'));
  assert(zip.file('small_zh.vtt'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var videoElems = doc.querySelectorAll('video');
  assert(videoElems[0].getAttribute('src') === `small.mp4`);
  assert(videoElems[0].getAttribute('poster') === `yellow.bmp`);
  var sourceElems = videoElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `small.webm`);
  assert(sourceElems[1].getAttribute('src') === `small.mp4`);
  var trackElems = videoElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `small_en.vtt`);
  assert(trackElems[1].getAttribute('src') === `small_zh.vtt`);

  /* capture.video = save-current */
  var options = {
    "capture.video": "save-current",
  };
  var blob = await capture({
    url: `${localhost}/capture_video/video.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length > 1);
  assert(zip.file('small_en.vtt'));
  assert(zip.file('small_zh.vtt'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var videoElems = doc.querySelectorAll('video');
  assert(videoElems[0].getAttribute('src') === `small.mp4`);
  assert(videoElems[0].getAttribute('poster') === `yellow.bmp`);
  assert(videoElems[1].getAttribute('src') === `small.mp4`
      || videoElems[1].getAttribute('src') === `small.webm`);
  var sourceElems = videoElems[1].querySelectorAll('source');
  assert(sourceElems.length === 0);
  var trackElems = videoElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `small_en.vtt`);
  assert(trackElems[1].getAttribute('src') === `small_zh.vtt`);

  /* capture.video = save-current (headless) */
  // the result is same as save
  var options = {
    "capture.video": "save-current",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_video/video.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('small.mp4'));
  assert(zip.file('small.webm'));
  assert(zip.file('small_en.vtt'));
  assert(zip.file('small_zh.vtt'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var videoElems = doc.querySelectorAll('video');
  assert(videoElems[0].getAttribute('src') === `small.mp4`);
  assert(videoElems[0].getAttribute('poster') === `yellow.bmp`);
  var sourceElems = videoElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `small.webm`);
  assert(sourceElems[1].getAttribute('src') === `small.mp4`);
  var trackElems = videoElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `small_en.vtt`);
  assert(trackElems[1].getAttribute('src') === `small_zh.vtt`);

  /* capture.video = link (headless) */
  var options = {
    "capture.video": "link",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_video/video.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var videoElems = doc.querySelectorAll('video');
  assert(videoElems[0].getAttribute('src') === `${localhost}/capture_video/small.mp4`);
  assert(videoElems[0].getAttribute('poster') === `${localhost}/capture_video/yellow.bmp`);
  var sourceElems = videoElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `${localhost}/capture_video/small.webm`);
  assert(sourceElems[1].getAttribute('src') === `${localhost}/capture_video/small.mp4`);
  var trackElems = videoElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `${localhost}/capture_video/small_en.vtt`);
  assert(trackElems[1].getAttribute('src') === `${localhost}/capture_video/small_zh.vtt`);

  /* capture.video = blank (headless) */
  var options = {
    "capture.video": "blank",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_video/video.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var videoElems = doc.querySelectorAll('video');
  assert(videoElems[0].getAttribute('src') === `about:blank`);
  assert(!videoElems[0].hasAttribute('poster'));
  var sourceElems = videoElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `about:blank`);
  assert(sourceElems[1].getAttribute('src') === `about:blank`);
  var trackElems = videoElems[1].querySelectorAll('track');
  assert(trackElems[0].getAttribute('src') === `about:blank`);
  assert(trackElems[1].getAttribute('src') === `about:blank`);

  /* capture.video = remove (headless) */
  var options = {
    "capture.video": "remove",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_video/video.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var videoElems = doc.querySelectorAll('video');
  assert(videoElems.length === 0);
  var sourceElems = doc.querySelectorAll('source');
  assert(sourceElems.length === 0);
  var trackElems = doc.querySelectorAll('track');
  assert(trackElems.length === 0);
});

/**
 * Check if option works
 *
 * capture.canvas
 */
it('test_capture_canvas', async function () {
  var options = {
    "capture.script": "remove",
    "capture.recordRewrites": true,
  };

  /* capture.canvas = save */
  options["capture.canvas"] = "save";
  var blob = await capture({
    url: `${localhost}/capture_canvas/canvas.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  assert(!doc.querySelector('#c1').hasAttribute("data-scrapbook-canvas"));
  assert(doc.querySelector('#c2').getAttribute("data-scrapbook-canvas").match(rawRegex`${'^'}data:image/png;base64,`));
  assertNoRecord(doc.querySelector('#c2'));

  // canvas in the shadow DOM
  var blob = await capture({
    url: `${localhost}/capture_canvas/canvas_shadow.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  var host = doc.querySelector('span');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('canvas').getAttribute('data-scrapbook-canvas').match(rawRegex`${'^'}data:image/png;base64,`));
  assertNoRecord(shadow.querySelector('canvas'));

  /* capture.canvas = blank */
  options["capture.canvas"] = "blank";
  var blob = await capture({
    url: `${localhost}/capture_canvas/canvas.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));
  assert(!doc.querySelector('#c1').hasAttribute("data-scrapbook-canvas"));
  assert(!doc.querySelector('#c2').hasAttribute("data-scrapbook-canvas"));

  // canvas in the shadow DOM
  var blob = await capture({
    url: `${localhost}/capture_canvas/canvas_shadow.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  var host = doc.querySelector('span');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(!shadow.querySelector('canvas').hasAttribute('data-scrapbook-canvas'));

  /* capture.canvas = remove */
  options["capture.canvas"] = "remove";
  var blob = await capture({
    url: `${localhost}/capture_canvas/canvas.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));
  assert(!doc.querySelector('#c1'));
  assert(!doc.querySelector('#c2'));

  // canvas in the shadow DOM
  var blob = await capture({
    url: `${localhost}/capture_canvas/canvas_shadow.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  var host = doc.querySelector('span');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(!shadow.querySelector('canvas'));
});

it('test_capture_canvas_webgl', async function () {
  var options = {
    "capture.canvas": "save",
    "capture.script": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_canvas/canvas_webgl.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  assert(doc.querySelector('canvas').getAttribute("data-scrapbook-canvas").match(rawRegex`${'^'}data:image/png;base64,`));
});

/**
 * Check if option works
 *
 * capture.embed
 */
it('test_capture_embed', async function () {
  /* capture.embed = save */
  var options = {
    "capture.embed": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_embed/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('helloworld.swf'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var embed = doc.querySelector('embed');
  assert(embed.getAttribute('src') === `helloworld.swf`);

  /* capture.embed = link */
  var options = {
    "capture.embed": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_embed/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var embed = doc.querySelector('embed');
  assert(embed.getAttribute('src') === `${localhost}/capture_embed/helloworld.swf`);

  /* capture.embed = blank */
  var options = {
    "capture.embed": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_embed/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var embed = doc.querySelector('embed');
  assert(!embed.hasAttribute('src'));

  /* capture.embed = remove */
  var options = {
    "capture.embed": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_embed/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var embed = doc.querySelector('embed');
  assert(!embed);
});

/**
 * Headlessly capture embed content like a frame.
 *
 * capture.embed
 */
it('test_capture_embed_frame', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.embed": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_embed_frame/cross_origin.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('embed');

  // frame1.html
  var frame = frames[0];
  assert(frame.getAttribute('src') === `index_1.html`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  // frame2.xhtml
  var frame = frames[1];
  assert(frame.getAttribute('src') === `index_2.xhtml`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  // frame3.svg
  var frame = frames[2];
  assert(frame.getAttribute('src') === `index_3.svg`);
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost2}/capture_embed_frame/cross_origin.py`);

  // frame4.txt
  var frame = frames[3];
  assert(frame.getAttribute('src') === 'frame4.txt');
  var frameFile = zip.file(frame.getAttribute('src'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === `<!DOCTYPE>
<style>img { width: 60px; }</style>
<p>Frame page content.</p>
<img src="./red.bmp">`);
});

/**
 * about: pages should be kept as-is.
 *
 * capture.embed
 */
it('test_capture_embed_frame_about', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.embed": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_embed_frame/about.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('embed');
  assert(frames[0].getAttribute('src') === "about:blank");
  assert(frames[1].getAttribute('src') === "about:blank?foo=bar#baz");
  assert(frames[2].getAttribute('src') === "about:srcdoc");
  assert(frames[3].getAttribute('src') === "about:invalid");
});

/**
 * Check if circular embed referencing is handled correctly like a frame.
 *
 * capture.embed
 */
it('test_capture_embed_circular', async function () {
  /* capture.saveAs = zip */
  // link to corresponding downloaded frame file
  var options = {
    "capture.embed": "save",
    "capture.saveAs": "zip",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_embed_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // frame1.html
  var frame = doc.querySelector('embed');
  var frameSrc = frame.getAttribute('src');
  assert(frameSrc === 'index_1.html');
  var frameFile = zip.file(frameSrc);
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  // frame2.html
  var frame = frameDoc.querySelector('embed');
  var frameSrc = frame.getAttribute('src');
  assert(frameSrc === 'index_2.html');
  var frameFile = zip.file(frameSrc);
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  // index.html
  var frame = frameDoc.querySelector('embed');
  var frameSrc = frame.getAttribute('src');
  assert(frameSrc === 'index.html');

  /* capture.saveAs = singleHtml */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.embed": "save",
    "capture.saveAs": "singleHtml",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_embed_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(frame.getAttribute('src') === `urn:scrapbook:download:circular:url:${localhost}/capture_embed_circular/index.html`);
});

/**
 * Check if option works
 *
 * capture.object
 */
it('test_capture_object', async function () {
  var options = {
    "capture.frameRename": false,
    "capture.saveResourcesSequentially": true,
  };

  /* capture.object = save */
  options["capture.object"] = "save";
  var blob = await capture({
    url: `${localhost}/capture_object/object.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('demo.svg'));
  assert(zip.file('green.bmp'));
  assert(zip.file('demo2.svg'));
  assert(zip.file('green2.bmp'));
  assert(zip.file('demo-1.svg'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var objects = doc.querySelectorAll('object');
  assert(objects[0].getAttribute('data') === `demo.svg`);
  assert(objects[1].getAttribute('data') === `green.bmp`);
  assert(objects[2].getAttribute('data') === `demo2.svg`);
  assert(!objects[2].hasAttribute('codebase'));
  assert(objects[3].getAttribute('data') === `green2.bmp`);
  assert(!objects[3].hasAttribute('codebase'));
  assert(objects[4].getAttribute('archive') === `demo-1.svg green.bmp`);

  /* capture.object = link */
  options["capture.object"] = "link";
  var blob = await capture({
    url: `${localhost}/capture_object/object.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var objects = doc.querySelectorAll('object');
  assert(objects[0].getAttribute('data') === `${localhost}/capture_object/demo.svg`);
  assert(objects[1].getAttribute('data') === `${localhost}/capture_object/green.bmp`);
  assert(objects[2].getAttribute('data') === `${localhost}/capture_object/resources/demo2.svg`);
  assert(!objects[2].hasAttribute('codebase'));
  assert(objects[3].getAttribute('data') === `${localhost}/capture_object/resources/green2.bmp`);
  assert(!objects[3].hasAttribute('codebase'));
  assert(objects[4].getAttribute('archive') === `${localhost}/capture_object/demo.svg ${localhost}/capture_object/green.bmp`);

  /* capture.object = blank */
  options["capture.object"] = "blank";
  var blob = await capture({
    url: `${localhost}/capture_object/object.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

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

  /* capture.object = remove */
  options["capture.object"] = "remove";
  var blob = await capture({
    url: `${localhost}/capture_object/object.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('object'));
});

/**
 * Headlessly capture object content like a frame.
 *
 * capture.object
 */
it('test_capture_object_frame', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.object": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_object_frame/cross_origin.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('object');

  // frame1.html
  var frame = frames[0];
  assert(frame.getAttribute('data') === `index_1.html`);
  var frameFile = zip.file(frame.getAttribute('data'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  // frame2.xhtml
  var frame = frames[1];
  assert(frame.getAttribute('data') === `index_2.xhtml`);
  var frameFile = zip.file(frame.getAttribute('data'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  // frame3.svg
  var frame = frames[2];
  assert(frame.getAttribute('data') === `index_3.svg`);
  var frameFile = zip.file(frame.getAttribute('data'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost2}/capture_object_frame/cross_origin.py`);

  // frame4.txt
  var frame = frames[3];
  assert(frame.getAttribute('data') === 'frame4.txt');
  var frameFile = zip.file(frame.getAttribute('data'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === `<!DOCTYPE>
<style>img { width: 60px; }</style>
<p>Frame page content.</p>
<img src="./red.bmp">`);
});

/**
 * about: pages should be kept as-is.
 *
 * capture.object
 */
it('test_capture_object_frame_about', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.object": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_object_frame/about.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('object');
  assert(frames[0].getAttribute('data') === "about:blank");
  assert(frames[1].getAttribute('data') === "about:blank?foo=bar#baz");
  assert(frames[2].getAttribute('data') === "about:srcdoc");
  assert(frames[3].getAttribute('data') === "about:invalid");
});

/**
 * Check if circular object referencing is handled correctly like a frame.
 *
 * capture.object
 */
it('test_capture_object_circular', async function () {
  /* capture.saveAs = zip */
  // link to corresponding downloaded frame file
  var options = {
    "capture.object": "save",
    "capture.saveAs": "zip",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_object_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // frame1.html
  var frame = doc.querySelector('object');
  var frameSrc = frame.getAttribute('data');
  assert(frameSrc === 'index_1.html');
  var frameFile = zip.file(frameSrc);
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  // frame2.html
  var frame = frameDoc.querySelector('object');
  var frameSrc = frame.getAttribute('data');
  assert(frameSrc === 'index_2.html');
  var frameFile = zip.file(frameSrc);
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  // index.html
  var frame = frameDoc.querySelector('object');
  var frameSrc = frame.getAttribute('data');
  assert(frameSrc === 'index.html');

  /* capture.saveAs = singleHtml */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.object": "save",
    "capture.saveAs": "singleHtml",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_object_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(frame.getAttribute('data') === `urn:scrapbook:download:circular:url:${localhost}/capture_object_circular/index.html`);
});

/**
 * Check if option works
 *
 * capture.applet
 */
it('test_capture_applet', async function () {
  /* capture.applet = save */
  var options = {
    "capture.applet": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_applet/applet.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('applet.class'));
  assert(zip.file('applet.jar'));
  assert(zip.file('applet2.class'));
  assert(zip.file('applet2.jar'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var applets = doc.querySelectorAll('applet');
  assert(applets[0].getAttribute('code') === `applet.class`);
  assert(applets[0].getAttribute('archive') === `applet.jar`);
  assert(applets[1].getAttribute('code') === `applet2.class`);
  assert(applets[1].getAttribute('archive') === `applet2.jar`);
  assert(!applets[1].hasAttribute('codebase'));

  /* capture.applet = link */
  var options = {
    "capture.applet": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_applet/applet.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var applets = doc.querySelectorAll('applet');
  assert(applets[0].getAttribute('code') === `${localhost}/capture_applet/applet.class`);
  assert(applets[0].getAttribute('archive') === `${localhost}/capture_applet/applet.jar`);
  assert(applets[1].getAttribute('code') === `${localhost}/capture_applet/resources/applet2.class`);
  assert(applets[1].getAttribute('archive') === `${localhost}/capture_applet/resources/applet2.jar`);
  assert(!applets[1].hasAttribute('codebase'));

  /* capture.applet = blank */
  var options = {
    "capture.applet": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_applet/applet.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var applets = doc.querySelectorAll('applet');
  assert(!applets[0].hasAttribute('code'));
  assert(!applets[0].hasAttribute('archive'));
  assert(!applets[1].hasAttribute('code'));
  assert(!applets[1].hasAttribute('archive'));
  assert(!applets[1].hasAttribute('codebase'));

  /* capture.applet = remove */
  var options = {
    "capture.applet": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_applet/applet.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('applet'));
});

/**
 * Check if template content is captured.
 *
 * - Getting/setting template.innerHTML/outerHTML is redirected to handle
 *   template.content, which is a hidden DocumentFragment.
 * - Getting/setting template.textContent or template.appendChild handles
 *   its childNodes. By default a templates is styled display: none, but can
 *   be changed by CSS.
 *
 * capturer.captureDocument
 */
it('test_capture_template', async function () {
  /* tab */
  var blob = await capture({
    url: `${localhost}/capture_template/template.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('template').innerHTML.trim() === `\
<img src="./nonexist.bmp">
<a href="./nonexist.html">anchor</a>`);

  /* headless */
  var blob = await captureHeadless({
    url: `${localhost}/capture_template/template.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('template').innerHTML.trim() === `\
<img src="./nonexist.bmp">
<a href="./nonexist.html">anchor</a>`);
});

/**
 * Check if option works
 *
 * capture.formStatus
 * capture.recordRewrites
 */
it('test_capture_formStatus', async function () {
  var options = {
    "capture.recordRewrites": true,
  };

  /* capture.formStatus = save-all */
  options["capture.formStatus"] = "save-all";
  var blob = await capture({
    url: `${localhost}/capture_form/form-status.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked'));
  assert(doc.querySelectorAll('input[type="radio"]')[0].getAttribute('data-scrapbook-input-checked') === 'true');
  assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="radio"]')[3].hasAttribute('checked'));
  assert(doc.querySelectorAll('input[type="radio"]')[3].getAttribute('data-scrapbook-input-checked') === 'false');
  assert(!doc.querySelectorAll('input[type="checkbox"]')[0].hasAttribute('checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute('data-scrapbook-input-checked') === 'true');
  assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute('data-scrapbook-input-checked') === 'false');
  assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-indeterminate'));
  assert(!doc.querySelector('input[type="text"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="text"]').getAttribute('data-scrapbook-input-value') === "myname");
  assert(!doc.querySelector('input[type="password"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="password"]').getAttribute('data-scrapbook-input-value') === "mypassword");
  assert(!doc.querySelector('input[type="number"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="number"]').getAttribute('data-scrapbook-input-value') === "3");
  assert(!doc.querySelector('input[type="search"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="search"]').getAttribute('data-scrapbook-input-value') === "search input");
  assert(!doc.querySelector('input[type="color"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="color"]').hasAttribute('data-scrapbook-input-value'));
  assert(!doc.querySelector('input[type="range"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="range"]').hasAttribute('data-scrapbook-input-value'));
  assert(doc.querySelector('textarea').textContent === "");
  assert(doc.querySelector('textarea').getAttribute('data-scrapbook-textarea-value') === "textarea input");
  assert(!doc.querySelectorAll('option')[0].hasAttribute('selected'));
  assert(doc.querySelectorAll('option')[0].getAttribute('data-scrapbook-option-selected') === "true");
  assert(doc.querySelectorAll('option')[1].hasAttribute('selected'));
  assert(doc.querySelectorAll('option')[1].getAttribute('data-scrapbook-option-selected') === "false");

  // check records
  // no attribute change except for added "data-scrapbook-*" ones
  assertNoRecord(doc);

  /* capture.formStatus = save */
  options["capture.formStatus"] = "save";
  var blob = await capture({
    url: `${localhost}/capture_form/form-status.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked'));
  assert(doc.querySelectorAll('input[type="radio"]')[0].getAttribute('data-scrapbook-input-checked') === 'true');
  assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="radio"]')[3].hasAttribute('checked'));
  assert(doc.querySelectorAll('input[type="radio"]')[3].getAttribute('data-scrapbook-input-checked') === 'false');
  assert(!doc.querySelectorAll('input[type="checkbox"]')[0].hasAttribute('checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute('data-scrapbook-input-checked') === 'true');
  assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute('data-scrapbook-input-checked') === 'false');
  assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('checked'));
  assert(!doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-checked'));
  assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-indeterminate'));
  assert(!doc.querySelector('input[type="text"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="text"]').getAttribute('data-scrapbook-input-value') === "myname");
  assert(!doc.querySelector('input[type="password"]').hasAttribute('value'));
  assert(!doc.querySelector('input[type="password"]').hasAttribute('data-scrapbook-input-value'));
  assert(!doc.querySelector('input[type="number"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="number"]').getAttribute('data-scrapbook-input-value') === "3");
  assert(!doc.querySelector('input[type="search"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="search"]').getAttribute('data-scrapbook-input-value') === "search input");
  assert(!doc.querySelector('input[type="color"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="color"]').hasAttribute('data-scrapbook-input-value'));
  assert(!doc.querySelector('input[type="range"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="range"]').hasAttribute('data-scrapbook-input-value'));
  assert(doc.querySelector('textarea').textContent === "");
  assert(doc.querySelector('textarea').getAttribute('data-scrapbook-textarea-value') === "textarea input");
  assert(!doc.querySelectorAll('option')[0].hasAttribute('selected'));
  assert(doc.querySelectorAll('option')[0].getAttribute('data-scrapbook-option-selected') === "true");
  assert(doc.querySelectorAll('option')[1].hasAttribute('selected'));
  assert(doc.querySelectorAll('option')[1].getAttribute('data-scrapbook-option-selected') === "false");

  // check records
  // no attribute change except for added "data-scrapbook-*" ones
  assertNoRecord(doc);

  /* capture.formStatus = keep-all */
  options["capture.formStatus"] = "keep-all";
  var blob = await capture({
    url: `${localhost}/capture_form/form-status.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(doc.querySelector('input[type="text"]').getAttribute('value') === "myname");
  assert(doc.querySelector('input[type="password"]').getAttribute('value') === "mypassword");
  assert(doc.querySelector('input[type="number"]').getAttribute('value') === "3");
  assert(doc.querySelector('input[type="search"]').getAttribute('value') === "search input");
  assert(doc.querySelector('input[type="color"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="range"]').hasAttribute('value'));
  assert(doc.querySelector('textarea').textContent === "textarea input");
  assert(doc.querySelectorAll('option')[0].hasAttribute('selected'));
  assert(!doc.querySelectorAll('option')[1].hasAttribute('selected'));

  // check records
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
  assert(doc.querySelectorAll('input[type="radio"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="radio"]')[1]);
  assertNoRecord(doc.querySelectorAll('input[type="radio"]')[2]);
  assert(doc.querySelectorAll('input[type="radio"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`) === ``);
  assert(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[1]);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[2]);
  assert(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[4]);
  assert(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="password"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="number"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="search"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="color"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="range"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`) === ``);
  assert(doc.querySelectorAll('option')[0].getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`) === ``);
  assert(doc.querySelectorAll('option')[1].getAttribute(`data-scrapbook-orig-attr-selected-${timeId}`) === ``);
  assertNoRecord(doc, {filter: 'scrapbook'});

  /* capture.formStatus = keep */
  options["capture.formStatus"] = "keep";
  var blob = await capture({
    url: `${localhost}/capture_form/form-status.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(doc.querySelector('input[type="text"]').getAttribute('value') === "myname");
  assert(!doc.querySelector('input[type="password"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="number"]').getAttribute('value') === "3");
  assert(doc.querySelector('input[type="search"]').getAttribute('value') === "search input");
  assert(doc.querySelector('input[type="color"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="range"]').hasAttribute('value'));
  assert(doc.querySelector('textarea').textContent === "textarea input");
  assert(doc.querySelectorAll('option')[0].hasAttribute('selected'));
  assert(!doc.querySelectorAll('option')[1].hasAttribute('selected'));

  // check records
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
  assert(doc.querySelectorAll('input[type="radio"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="radio"]')[1]);
  assertNoRecord(doc.querySelectorAll('input[type="radio"]')[2]);
  assert(doc.querySelectorAll('input[type="radio"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`) === ``);
  assert(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[1]);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[2]);
  assert(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[4]);
  assert(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assertNoRecord(doc.querySelector('input[type="password"]'));
  assert(doc.querySelector('input[type="number"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="search"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="color"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="range"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`) === ``);
  assert(doc.querySelectorAll('option')[0].getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`) === ``);
  assert(doc.querySelectorAll('option')[1].getAttribute(`data-scrapbook-orig-attr-selected-${timeId}`) === ``);
  assertNoRecord(doc, {filter: 'scrapbook'});

  /* capture.formStatus = html-all */
  options["capture.formStatus"] = "html-all";
  var blob = await capture({
    url: `${localhost}/capture_form/form-status.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(doc.querySelector('input[type="text"]').getAttribute('value') === "myname");
  assert(doc.querySelector('input[type="password"]').getAttribute('value') === "mypassword");
  assert(doc.querySelector('input[type="number"]').getAttribute('value') === "3");
  assert(doc.querySelector('input[type="search"]').getAttribute('value') === "search input");
  assert(doc.querySelector('input[type="color"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="range"]').hasAttribute('value'));
  assert(doc.querySelector('textarea').textContent === "textarea input");
  assert(doc.querySelectorAll('option')[0].hasAttribute('selected'));
  assert(!doc.querySelectorAll('option')[1].hasAttribute('selected'));

  // check records
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
  assert(doc.querySelectorAll('input[type="radio"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="radio"]')[1]);
  assertNoRecord(doc.querySelectorAll('input[type="radio"]')[2]);
  assert(doc.querySelectorAll('input[type="radio"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`) === ``);
  assert(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[1]);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[2]);
  assert(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[4]);
  assert(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="password"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="number"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="search"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="color"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="range"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`) === ``);
  assert(doc.querySelectorAll('option')[0].getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`) === ``);
  assert(doc.querySelectorAll('option')[1].getAttribute(`data-scrapbook-orig-attr-selected-${timeId}`) === ``);
  assertNoRecord(doc, {filter: 'scrapbook'});

  /* capture.formStatus = html */
  options["capture.formStatus"] = "html";
  var blob = await capture({
    url: `${localhost}/capture_form/form-status.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(doc.querySelector('input[type="text"]').getAttribute('value') === "myname");
  assert(!doc.querySelector('input[type="password"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="number"]').getAttribute('value') === "3");
  assert(doc.querySelector('input[type="search"]').getAttribute('value') === "search input");
  assert(doc.querySelector('input[type="color"]').hasAttribute('value'));
  assert(doc.querySelector('input[type="range"]').hasAttribute('value'));
  assert(doc.querySelector('textarea').textContent === "textarea input");
  assert(doc.querySelectorAll('option')[0].hasAttribute('selected'));
  assert(!doc.querySelectorAll('option')[1].hasAttribute('selected'));

  // check records
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
  assert(doc.querySelectorAll('input[type="radio"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="radio"]')[1]);
  assertNoRecord(doc.querySelectorAll('input[type="radio"]')[2]);
  assert(doc.querySelectorAll('input[type="radio"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`) === ``);
  assert(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[1]);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[2]);
  assert(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`) === ``);
  assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[4]);
  assert(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assertNoRecord(doc.querySelector('input[type="password"]'));
  assert(doc.querySelector('input[type="number"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="search"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="color"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('input[type="range"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`) === ``);
  assert(doc.querySelectorAll('option')[0].getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`) === ``);
  assert(doc.querySelectorAll('option')[1].getAttribute(`data-scrapbook-orig-attr-selected-${timeId}`) === ``);
  assertNoRecord(doc, {filter: 'scrapbook'});

  /* capture.formStatus = reset */
  options["capture.formStatus"] = "reset";
  var blob = await capture({
    url: `${localhost}/capture_form/form-status.html`,
    options: Object.assign({}, baseOptions, options),
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
  assert(doc.querySelector('textarea').textContent === "");
  assert(!doc.querySelectorAll('option')[0].hasAttribute('selected'));
  assert(doc.querySelectorAll('option')[1].hasAttribute('selected'));

  // check records
  assertNoRecord(doc);
});

/**
 * Check if SVG can be captured correctly.
 *
 * capturer.captureDocument
 */
it('test_capture_svg', async function () {
  /* embed.html */
  var options = {
    "capture.image": "save",
    "capture.script": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_svg/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("green.bmp"));
  assert(zip.file("blue.bmp"));
  assert(zip.file("script.js"));
  assert(zip.file("script2.js"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('svg a')[0].getAttribute('href') === `${localhost}/capture_svg/resources/green.bmp`);
  assert(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href') === `${localhost}/capture_svg/resources/blue.bmp`);
  assert(doc.querySelectorAll('svg image')[0].getAttribute('href') === `green.bmp`);
  assert(doc.querySelectorAll('svg image')[1].getAttribute('xlink:href') === `blue.bmp`);
  assert(doc.querySelectorAll('svg use')[0].getAttribute('href') === `#img1`);
  assert(doc.querySelectorAll('svg use')[1].getAttribute('xlink:href') === `#img2`);
  assert(doc.querySelectorAll('svg script')[0].getAttribute('href') === `script.js`);
  assert(doc.querySelectorAll('svg script')[1].getAttribute('xlink:href') === `script2.js`);

  /* external.svg */
  var options = {
    "capture.image": "save",
    "capture.script": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_svg/external.svg`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("index.svg"));
  assert(zip.file("green.bmp"));

  var indexFile = zip.file('index.svg');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('svg a')[0].getAttribute('href') === `${localhost}/capture_svg/resources/green.bmp`);
  assert(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href') === `${localhost}/capture_svg/resources/blue.bmp`);
  assert(doc.querySelectorAll('svg image')[0].getAttribute('href') === `green.bmp`);
  assert(doc.querySelectorAll('svg image')[1].getAttribute('xlink:href') === `blue.bmp`);
  assert(doc.querySelectorAll('svg use')[0].getAttribute('href') === `#img1`);
  assert(doc.querySelectorAll('svg use')[1].getAttribute('xlink:href') === `#img2`);
  assert(doc.querySelectorAll('svg script')[0].getAttribute('href') === `script.js`);
  assert(doc.querySelectorAll('svg script')[1].getAttribute('xlink:href') === `script2.js`);
});

/**
 * Check if MathML can be captured correctly.
 *
 * capturer.captureDocument
 */
it('test_capture_mathml', async function () {
  /* embed.html */
  var options = {
    "capture.image": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_mathml/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('math')[0].getAttribute('href') === `${localhost}/capture_mathml/resources/green.bmp`);
  assert(doc.querySelectorAll('math msup')[0].getAttribute('href') === `${localhost}/capture_mathml/resources/red.bmp`);
  assert(doc.querySelectorAll('math mi')[2].getAttribute('href') === `${localhost}/capture_mathml/resources/blue.bmp`);
});

/**
 * Check if <style> or <script> is in another namespace.
 *
 * capturer.captureDocument
 */
it('test_capture_namespace', async function () {
  var blob = await capture({
    url: `${localhost}/capture_namespace/namespace.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].innerHTML.trim() === `body > #html { background: green; }`);
  assert(styleElems[1].innerHTML.trim() === `body > #non-html { background: green; }`);
  assert(styleElems[2].innerHTML.trim() === `#svg &gt; circle { fill: green; }`);
  assert(styleElems[3].innerHTML.trim() === `#non-svg &gt; circle { fill: green; }`);

  var scriptElems = doc.querySelectorAll('script');
  assert(scriptElems[0].innerHTML.trim() === `console.log("head > html script")`);
  assert(scriptElems[1].innerHTML.trim() === `console.log("head > non-html script")`);
  assert(scriptElems[2].innerHTML.trim() === `console.log("svg &gt; svg script")`);
  assert(scriptElems[3].innerHTML.trim() === `console.log("svg &gt; html script")`);
});

/**
 * Escape bad tags for security
 *
 * capturer.captureDocument
 */
it('test_capture_invalid_tags', async function () {
  var options = {
    "capture.style": "save",
    "capture.script": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_invalid_tags/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('xmp').textContent.trim() === r`Explode <\/xmp> with a bomb!<script>alert("bomb");</script>`);
  assert(doc.querySelector('style').textContent.trim() === r`/*Explode <\/style> with a bomb!<script>alert("bomb");</script>*/`);
  assert(doc.querySelector('script').textContent.trim() === r`/*Explode <\/script> with a bomb!<script>alert("bomb");<\/script>*/`);
});

/**
 * Check if no error when parent is to be removed and child is to be captured.
 *
 * capturer.captureDocument
 */
it('test_capture_recursive', async function () {
  var options = {
    "capture.image": "remove",
    "capture.script": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_recursive/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(!zip.file("red.bmp"));
  assert(!zip.file("blue.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('picture'));
  assert(!doc.querySelector('img'));
  assert(!doc.querySelector('script'));
});

/**
 * Check if removeHidden works correctly.
 *
 * capturer.removeHidden
 */
it('test_capture_removeHidden', async function () {
  /* capture.removeHidden = undisplayed */
  var options = {
    "capture.removeHidden": "undisplayed",
  };

  var blob = await capture({
    url: `${localhost}/capture_removeHidden/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(!zip.file("red.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('p'));
  assert(!doc.querySelector('blockquote'));
  assert(!doc.querySelector('img'));

  // these elements should not be altered anyway
  assert(doc.querySelector('html'));
  assert(doc.querySelector('head'));
  assert(doc.querySelector('meta'));
  assert(doc.querySelector('title'));
  assert(doc.querySelector('style'));
  assert(doc.querySelector('link[rel="stylesheet"]'));
  assert(doc.querySelector('body'));
  assert(doc.querySelector('noscript'));
  assert(doc.querySelector('template'));

  /* capture.removeHidden = none */
  var options = {
    "capture.removeHidden": "none",
  };

  var blob = await capture({
    url: `${localhost}/capture_removeHidden/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("red.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('p'));
  assert(doc.querySelector('blockquote'));

  assert(doc.querySelector('img'));
  assert(doc.querySelector('html'));
  assert(doc.querySelector('head'));
  assert(doc.querySelector('meta'));
  assert(doc.querySelector('title'));
  assert(doc.querySelector('style'));
  assert(doc.querySelector('link[rel="stylesheet"]'));
  assert(doc.querySelector('body'));
  assert(doc.querySelector('noscript'));
  assert(doc.querySelector('template'));
});

/**
 * Check if "cite" attribute is correctly rewritten
 *
 * capturer.captureDocument
 */
it('test_capture_cite', async function () {
  var blob = await capture({
    url: `${localhost}/capture_cite/cite.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('q').getAttribute('cite') === `${localhost}/capture_cite/test.html`);
  assert(doc.querySelector('blockquote').getAttribute('cite') === `${localhost}/capture_cite/test.html`);
  assert(doc.querySelector('ins').getAttribute('cite') === `${localhost}/capture_cite/test.html`);
  assert(doc.querySelector('del').getAttribute('cite') === `${localhost}/capture_cite/test.html`);
});

/**
 * Check if option works
 *
 * capture.preload
 */
it('test_capture_preload', async function () {
  /* capture.preload = blank */
  var options = {
    "capture.preload": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_preload/preload.html`,
    options: Object.assign({}, baseOptions, options),
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

  /* capture.preload = remove */
  var options = {
    "capture.preload": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_preload/preload.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('link[rel="preload"]'));
  assert(!doc.querySelector('link[rel="modulepreload"]'));
  assert(!doc.querySelector('link[rel="dns-prefetch"]'));
  assert(!doc.querySelector('link[rel="preconnect"]'));
});

/**
 * Check if option works
 *
 * capture.prefetch
 */
it('test_capture_prefetch', async function () {
  /* capture.prefetch = blank */
  var options = {
    "capture.prefetch": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_prefetch/prefetch.html`,
    options: Object.assign({}, baseOptions, options),
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

  /* capture.prefetch = remove */
  var options = {
    "capture.prefetch": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_prefetch/prefetch.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('link[rel="prefetch"]'));
  assert(!doc.querySelector('link[rel="prerender"]'));
});

/**
 * Check handling of crossorigin attribute
 */
it('test_capture_crossorigin', async function () {
  /* save */
  var options = {
    "capture.image": "save",
    "capture.favicon": "save",
    "capture.audio": "save",
    "capture.video": "save",
    "capture.style": "save",
    "capture.rewriteCss": "url",
    "capture.script": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_crossorigin/crossorigin.py`,
    options: Object.assign({}, baseOptions, options),
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

  /* link */
  var options = {
    "capture.image": "link",
    "capture.favicon": "link",
    "capture.audio": "link",
    "capture.video": "link",
    "capture.style": "link",
    "capture.script": "link",
  };

  var blob = await capture({
    url: `${localhost}/capture_crossorigin/crossorigin.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link[rel~="stylesheet"]').getAttribute('crossorigin') === '');
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('crossorigin') === '');
  assert(doc.querySelector('script').getAttribute('crossorigin') === '');
  assert(doc.querySelector('img').getAttribute('crossorigin') === '');
  assert(doc.querySelector('audio').getAttribute('crossorigin') === '');
  assert(doc.querySelector('video').getAttribute('crossorigin') === '');

  /* blank */
  var options = {
    "capture.image": "blank",
    "capture.favicon": "blank",
    "capture.audio": "blank",
    "capture.video": "blank",
    "capture.style": "blank",
    "capture.script": "blank",
  };

  var blob = await capture({
    url: `${localhost}/capture_crossorigin/crossorigin.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link[rel~="stylesheet"]').getAttribute('crossorigin') === '');
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('crossorigin') === '');
  assert(doc.querySelector('script').getAttribute('crossorigin') === '');
  assert(doc.querySelector('img').getAttribute('crossorigin') === '');
  assert(doc.querySelector('audio').getAttribute('crossorigin') === '');
  assert(doc.querySelector('video').getAttribute('crossorigin') === '');
});

/**
 * Check handling of integrity attribute
 */
it('test_capture_integrity', async function () {
  /* save */
  var options = {
    "capture.style": "save",
    "capture.script": "save",
    "capture.rewriteCss": "url",
  };

  var blob = await capture({
    url: `${localhost}/capture_integrity/integrity.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('link').hasAttribute('integrity'));
  assert(!doc.querySelector('script').hasAttribute('integrity'));

  /* link */
  var options = {
    "capture.style": "link",
    "capture.script": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_integrity/integrity.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('link').hasAttribute('integrity'));
  assert(!doc.querySelector('script').hasAttribute('integrity'));

  /* blank */
  var options = {
    "capture.style": "blank",
    "capture.script": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_integrity/integrity.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('link').hasAttribute('integrity'));
  assert(!doc.querySelector('script').hasAttribute('integrity'));
});

/**
 * Check if option works
 *
 * capture.referrerPolicy
 */
it('test_capture_referrer', async function () {
  /* capture.referrerPolicy = no-referrer */
  var options = {
    "capture.referrerPolicy": "no-referrer",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === "");
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === "");

  /* capture.referrerPolicy = origin */
  var options = {
    "capture.referrerPolicy": "origin",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  /* capture.referrerPolicy = unsafe-url */
  var options = {
    "capture.referrerPolicy": "unsafe-url",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/index.py`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/index.py`);

  /* capture.referrerPolicy = origin-when-cross-origin */
  var options = {
    "capture.referrerPolicy": "origin-when-cross-origin",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/index.py`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  /* capture.referrerPolicy = same-origin */
  var options = {
    "capture.referrerPolicy": "same-origin",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/index.py`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === "");

  /* capture.referrerPolicy = no-referrer-when-downgrade */
  var options = {
    "capture.referrerPolicy": "no-referrer-when-downgrade",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/index.py`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/index.py`);

  /* capture.referrerPolicy = strict-origin */
  var options = {
    "capture.referrerPolicy": "strict-origin",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  /* capture.referrerPolicy = strict-origin-when-cross-origin */
  var options = {
    "capture.referrerPolicy": "strict-origin-when-cross-origin",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/index.py`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);
});

/**
 * Check if referrer spoofing works
 *
 * capture.referrerSpoofSource
 * capture.referrerPolicy
 */
it('test_capture_referrer_spoof', async function () {
  /* capture.referrerSpoofSource = false */
  var options = {
    "capture.referrerPolicy": "unsafe-url",
    "capture.referrerSpoofSource": false,
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/index.py`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/index.py`);

  /* capture.referrerSpoofSource = true */
  var options = {
    "capture.referrerPolicy": "unsafe-url",
    "capture.referrerSpoofSource": true,
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer/referrer.py`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost2}/capture_referrer/referrer2.py`);

  /* capture.referrerSpoofSource = true; capture.referrerPolicy = origin */
  var options = {
    "capture.referrerPolicy": "origin",
    "capture.referrerSpoofSource": true,
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer/index.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var file = zip.file('referrer.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);
  var file = zip.file('referrer2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost2}/`);
});

/**
 * Check if referrerpolicy attribute and rel=noreferrer are honored.
 * Check if capture.referrerPolicy takes lower priority.
 *
 * capture.referrerPolicy
 */
it('test_capture_referrer_attr', async function () {
  var options = {
    "capture.referrerPolicy": "unsafe-url",
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": "py",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer_attr/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  var file = zip.file('favicon.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('favicon_rel.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === ``);

  var file = zip.file('stylesheet.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('stylesheet_rel.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === ``);

  var file = zip.file('script.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('imgsrc.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('imgsrcset.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('iframe.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('a.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('a_rel.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === ``);

  var file = zip.file('area.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('area_rel.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === ``);
});

/**
 * Check if capture.referrerPolicy with "+"-prefix takes higher priority
 * than referrerpolicy attribute and rel=noreferrer.
 *
 * capture.referrerPolicy
 */
it('test_capture_referrer_attr_force', async function () {
  var options = {
    "capture.referrerPolicy": "+unsafe-url",
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": "py",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer_attr/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  var file = zip.file('favicon.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('favicon_rel.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('stylesheet.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('stylesheet_rel.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('script.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('imgsrc.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('imgsrcset.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('iframe.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('a.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('a_rel.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('area.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);

  var file = zip.file('area_rel.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_attr/index.html`);
});

/**
 * Check if meta[name="referrer"] is honored.
 * Check if capture.referrerPolicy takes lower priority.
 *
 * capture.referrerPolicy
 */
it('test_capture_referrer_doc', async function () {
  var options = {
    "capture.referrerPolicy": "unsafe-url",
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": "py",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer_doc/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  var file = zip.file('style_import.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('style_font.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('style_bg.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('favicon.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('stylesheet.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('script.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('imgsrc.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('imgsrcset.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('iframe.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('a.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('area.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  // other
  var file = zip.file('table.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('tr.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('th.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('td.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('input.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('picture_source.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('audio.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('audio_source.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('audio_track.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('video.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('video_poster.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('video_source.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('video_track.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('embed.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('object.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('object_archive.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('applet.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('applet_archive.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  // svg
  var file = zip.file('svg_image.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('svg_imagex.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('svg_script.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('svg_scriptx.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('svg_a.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('svg_ax.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  // math
  var file = zip.file('math_msup.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);
});

/**
 * Check if capture.referrerPolicy with "+"-prefix takes higher priority
 * than meta[name="referrer"].
 *
 * capture.referrerPolicy
 */
it('test_capture_referrer_doc_force', async function () {
  var options = {
    "capture.referrerPolicy": "+unsafe-url",
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": "py",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer_doc/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  var file = zip.file('style_import.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('style_font.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('style_bg.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('favicon.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('stylesheet.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('script.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('imgsrc.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('imgsrcset.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('iframe.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('a.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('area.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('svg_image.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('svg_imagex.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('svg_script.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('svg_scriptx.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('svg_a.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('svg_ax.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);

  var file = zip.file('math_msup.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_doc/index.html`);
});

/**
 * Check referrer policy for cross-origin external and imported CSS.
 *
 * capture.referrerPolicy
 */
it('test_capture_referrer_cross_origin', async function () {
  for (const rewriteCss of ["url", "tidy", "match"]) {
    console.debug("capture.rewriteCss = %s", rewriteCss);

    var options = {
      "capture.rewriteCss": rewriteCss,
      "capture.referrerPolicy": "",
    };
    var blob = await captureHeadless({
      url: `${localhost}/capture_referrer_cross_origin/index.py`,
      options: Object.assign({}, baseOptions, options),
    });
    var zip = await new JSZip().loadAsync(blob);

    var file = zip.file('css_bg.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_referrer_cross_origin/index.py`);

    var file = zip.file('css_style_bg.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_referrer_cross_origin/index.py`);

    var file = zip.file('css_style_font.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost}/capture_referrer_cross_origin/index.py`);

    var file = zip.file('css_style_import.py.css');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `:root { --referrer: "${localhost}/capture_referrer_cross_origin/index.py"; }`);

    var file = zip.file('css_link.py.css');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text.split('\n').pop() === `:root { --referrer: "${localhost}/capture_referrer_cross_origin/index.py"; }`);

    var file = zip.file('css_link_bg.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost2}/capture_referrer_cross_origin/css_link.py`);

    var file = zip.file('css_link_font.py');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `${localhost2}/capture_referrer_cross_origin/css_link.py`);

    var file = zip.file('css_link_import.py.css');
    var text = (await readFileAsText(await file.async('blob'))).trim();
    assert(text === `:root { --referrer: "${localhost2}/capture_referrer_cross_origin/css_link.py"; }`);
  }
});

/**
 * Check if dynamic meta[name="referrer"] is honored.
 *
 * capture.referrerPolicy
 */
it('test_capture_referrer_dynamic', async function () {
  var options = {
    "capture.referrerPolicy": "unsafe-url",
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": "py",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_referrer_dynamic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  var file = zip.file('css1.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_dynamic/index.html`);

  var file = zip.file('css2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/`);

  var file = zip.file('css3.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === ``);
});

/**
 * meta[name="referrer"] in a shadowRoot should be ignored.
 *
 * capture.referrerPolicy
 */
it('test_capture_referrer_dynamic_shadow', async function () {
  var options = {
    "capture.referrerPolicy": "unsafe-url",
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": "py",
  };
  var blob = await capture({
    url: `${localhost}/capture_referrer_dynamic_shadow/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var file = zip.file('css1.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_dynamic_shadow/index.html`);

  var file = zip.file('css2.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_dynamic_shadow/index.html`);

  var file = zip.file('css3.py');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `${localhost}/capture_referrer_dynamic_shadow/index.html`);
});

/**
 * Check if shadow DOMs (possibly nested) can be captured correctly.
 *
 * capturer.captureDocument
 */
it('test_capture_shadowRoot', async function () {
  /* capture.shadowDom = save */
  var options = {
    "capture.shadowDom": "save",
    "capture.image": "save",
    "capture.script": "remove",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/open.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("green.bmp"));
  assert(zip.file("blue.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host1 = doc.querySelector('div');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('img').getAttribute('src') === `green.bmp`);

  var host2 = shadow1.querySelector('p');
  var frag = doc.createElement("template");
  frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
  var shadow2 = frag.content;
  assert(shadow2.querySelector('img').getAttribute('src') === `blue.bmp`);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  // check records
  assertNoRecord(host1);
  assertNoRecord(host2);

  /* capture.shadowDom = remove */
  var options = {
    "capture.shadowDom": "remove",
    "capture.image": "save",
    "capture.script": "remove",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/open.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(!zip.file("green.bmp"));
  assert(!zip.file("blue.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('[data-scrapbook-shadowroot]'));
  assert(!doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  // check records
  var host1 = doc.querySelector('div');
  assertNoRecord(host1);
});

/**
 * Check if closed shadow DOMs (possibly nested) can be captured correctly.
 *
 * capturer.captureDocument
 */
$it.skipIf(
  userAgent.is('chromium') && userAgent.major < 88,
  'retrieving closed shadow DOM is not supported in Chromium < 88',
)('test_capture_shadowRoot_closed', async function () {
  /* capture.shadowDom = save */
  var options = {
    "capture.shadowDom": "save",
    "capture.image": "save",
    "capture.script": "remove",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/closed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("green.bmp"));
  assert(zip.file("blue.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host1 = doc.querySelector('div');
  assertEqual(host1.getAttribute("data-scrapbook-shadowdom-mode"), "closed");
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('img').getAttribute('src') === `green.bmp`);

  var host2 = shadow1.querySelector('p');
  assertEqual(host2.getAttribute("data-scrapbook-shadowdom-mode"), "closed");
  var frag = doc.createElement("template");
  frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
  var shadow2 = frag.content;
  assert(shadow2.querySelector('img').getAttribute('src') === `blue.bmp`);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  // check records
  assertNoRecord(host1);
  assertNoRecord(host2);
});

/**
 * Check if clonable shadow DOMs can be captured correctly.
 *
 * capturer.captureDocument
 */
$it.skipIf($.noShadowRootClonable)('test_capture_shadowRoot_clonable', async function () {
  /* capture.shadowDom = save */
  var options = {
    "capture.shadowDom": "save",
    "capture.image": "save",
    "capture.script": "remove",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/clonable.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("green.bmp"));
  assert(zip.file("blue.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host1 = doc.querySelector('div');
  assert(host1.hasAttribute("data-scrapbook-shadowdom-clonable"));
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('img').getAttribute('src') === `green.bmp`);

  var host2 = shadow1.querySelector('p');
  assert(host2.hasAttribute("data-scrapbook-shadowdom-clonable"));
  var frag = doc.createElement("template");
  frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
  var shadow2 = frag.content;
  assert(shadow2.querySelector('img').getAttribute('src') === `blue.bmp`);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  // check records
  assertNoRecord(host1);
  assertNoRecord(host2);

  /* capture.shadowDom = remove */
  var options = {
    "capture.shadowDom": "remove",
    "capture.image": "save",
    "capture.script": "remove",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/clonable.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(!zip.file("green.bmp"));
  assert(!zip.file("blue.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('[data-scrapbook-shadowroot]'));
  assert(!doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

  // check records
  var host1 = doc.querySelector('div');
  assertNoRecord(host1);
});

/**
 * Check handling of further shadow DOM properties.
 *
 * capturer.captureDocument
 */
$it.skipIf($.noShadowRootDelegatesFocus)
    .skipIf($.noShadowRootSerializable)
    .skipIf($.noShadowRootSlotAssignment)('test_capture_shadowRoot_options', async function () {
  /* capture.shadowDom = save */
  var options = {
    "capture.shadowDom": "save",
    "capture.recordRewrites": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/options.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host1 = doc.querySelector('div');
  assert(host1.hasAttribute("data-scrapbook-shadowdom-delegates-focus"));
  assert(host1.hasAttribute("data-scrapbook-shadowdom-serializable"));
  assertEqual(host1.getAttribute("data-scrapbook-shadowdom-slot-assignment"), "manual");

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  // check records
  assertNoRecord(host1);
});

/**
 * Check handling of slots.
 *
 * capturer.captureDocument
 */
$it.skipIf($.noShadowRootSlotAssignment)('test_capture_shadowRoot_slots', async function () {
  var options = {
    "capture.shadowDom": "save",
    "capture.recordRewrites": true,
  };

  /* slotAssignment = manual */
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/slot-manual.html`,
    options: Object.assign({}, baseOptions, options),
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
  assertEqual(spans[0].getAttribute('data-scrapbook-slot-index'), "0");
  assert(!spans[1].hasAttribute('data-scrapbook-slot-index'));
  assertEqual(spans[2].getAttribute('data-scrapbook-slot-index'), "2");
  assertEqual(spans[3].getAttribute('data-scrapbook-slot-index'), "3");
  assert(!spans[4].hasAttribute('data-scrapbook-slot-index'));

  var node = spans[1].nextSibling;
  assertEqual(node.nodeType, 8);
  assertEqual(node.nodeValue, 'scrapbook-slot-index=1');
  var node = node.nextSibling;
  assertEqual(node.nodeType, 3);
  assertEqual(node.nodeValue.trim(), 'Default3');
  var node = node.nextSibling;
  assertEqual(node.nodeType, 8);
  assertEqual(node.nodeValue, '/scrapbook-slot-index');

  var slots = shadow.querySelectorAll('slot');
  assertEqual(slots[0].getAttribute('data-scrapbook-slot-assigned'), "0,1");
  assertEqual(slots[1].getAttribute('data-scrapbook-slot-assigned'), "2,3");

  var host2 = shadow.querySelector('div');
  var frag = doc.createElement("template");
  frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
  var shadow2 = frag.content;

  var spans = host2.querySelectorAll('span');
  assert(!spans[0].hasAttribute('data-scrapbook-slot-index'));
  assertEqual(spans[1].getAttribute('data-scrapbook-slot-index'), "4");
  assertEqual(spans[2].getAttribute('data-scrapbook-slot-index'), "5");

  var slots = shadow2.querySelectorAll('slot');
  assertEqual(slots[0].getAttribute('data-scrapbook-slot-assigned'), "4,5");

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  assertNoRecord(host);
  assertNoRecord(shadow);
  assertNoRecord(host2);
  assertNoRecord(shadow2);

  /* slotAssignment = named */
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/slot-named.html`,
    options: Object.assign({}, baseOptions, options),
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
  assertEqual(node.nodeType, 3);
  assertEqual(node.nodeValue.trim(), 'Default3');
  assertEqual(node.nextSibling, spans[2]);

  var host2 = shadow.querySelector('div');
  var frag = doc.createElement("template");
  frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
  var shadow2 = frag.content;

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));

  assertNoRecord(host);
  assertNoRecord(host, {filter: {regexAttr: /^data-scrapbook-slot-/}});
  assertNoRecord(shadow);
  assertNoRecord(shadow, {filter: {regexAttr: /^data-scrapbook-slot-/}});
  assertNoRecord(host2);
  assertNoRecord(host2, {filter: {regexAttr: /^data-scrapbook-slot-/}});
  assertNoRecord(shadow2);
  assertNoRecord(shadow2, {filter: {regexAttr: /^data-scrapbook-slot-/}});
});

/**
 * Check for shadow DOM auto-generated via custom elements.
 *
 * capturer.captureDocument
 */
it('test_capture_shadowRoot_custom', async function () {
  var options = {
    "capture.shadowDom": "save",
    "capture.image": "save",
    "capture.script": "remove",
  };

  var blob = await capture({
    url: `${localhost}/capture_shadowRoot_custom/open.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("green.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host1 = doc.querySelector('custom-elem');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('img').getAttribute('src') === `green.bmp`);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));
});

$it.skipIf(
  userAgent.is('chromium') && userAgent.major < 88,
  'retrieving closed shadow DOM is not supported in Chromium < 88',
)('test_capture_shadowRoot_custom_closed', async function () {
  var options = {
    "capture.shadowDom": "save",
    "capture.image": "save",
    "capture.script": "remove",
  };

  var blob = await capture({
    url: `${localhost}/capture_shadowRoot_custom/closed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("green.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host1 = doc.querySelector('custom-elem');
  assertEqual(host1.getAttribute("data-scrapbook-shadowdom-mode"), "closed");
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('img').getAttribute('src') === `green.bmp`);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(rawRegex`${'^'}(function () {${'.+'}})()${'$'}`));
});

/**
 * Handle custom elements registry.
 *
 * capturer.captureDocument
 */
it('test_capture_custom_elements', async function () {
	/* capture.script = save */
  var options = {
    "capture.script": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_custom_elements/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`));

	/* capture.script = link */
  var options = {
    "capture.script": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_custom_elements/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`));

	/* capture.script = blank */
  var options = {
    "capture.script": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_custom_elements/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var value = doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`).textContent.trim();
  assert(value.match(rawRegex`${'^'}(function (names) {${'.+'}})(["custom-subelem","custom-elem"])${'$'}`));

	/* capture.script = remove */
  var options = {
    "capture.script": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_custom_elements/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var value = doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`).textContent.trim();
  assert(value.match(rawRegex`${'^'}(function (names) {${'.+'}})(["custom-subelem","custom-elem"])${'$'}`));
});

it('test_capture_custom_elements_bad', async function () {
	/* capture.script = remove */
  var options = {
    "capture.script": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_custom_elements/bad.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`));
});

/**
 * Check if option works
 *
 * capture.downLink.file.mode
 * capture.downLink.file.extFilter
 */
it('test_capture_downLink_file', async function () {
  /* header */
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `txt, bmp, css, html`,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 8);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `file.bmp`);
  assert(anchors[1].getAttribute('href') === `file.css#123`);
  assert(anchors[2].getAttribute('href') === `page.html`);
  assert(anchors[3].getAttribute('href') === `file.txt`);
  assert(anchors[4].getAttribute('href') === `file2.txt`);
  assert(anchors[5].getAttribute('href') === `${localhost}/capture_downLink_file/unknown.py`);
  assert(anchors[6].getAttribute('href') === `file3.txt`);
  assert(anchors[7].getAttribute('href') === `${localhost}/capture_downLink_file/nofilename.py`);
  assert(anchors[8].getAttribute('href') === `redirect.txt`);

  // page should be saved as file (not rewritten)
  var file = zip.file('page.html');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `\
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

  /* url */
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt, bmp, css, html`,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("file4.txt"));
  assert(Object.keys(zip.files).length === 5);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `file.bmp`);
  assert(anchors[1].getAttribute('href') === `file.css#123`);
  assert(anchors[2].getAttribute('href') === `page.html`);
  assert(anchors[3].getAttribute('href') === `file.txt`);
  assert(anchors[4].getAttribute('href') === `${localhost}/capture_downLink_file/mime.py`);
  assert(anchors[5].getAttribute('href') === `${localhost}/capture_downLink_file/unknown.py`);
  assert(anchors[6].getAttribute('href') === `${localhost}/capture_downLink_file/filename.py`);
  assert(anchors[7].getAttribute('href') === `${localhost}/capture_downLink_file/nofilename.py`);
  assert(anchors[8].getAttribute('href') === `${localhost}/capture_downLink_file/redirect.pyr`);

  // page should be saved as file (not rewritten)
  var file = zip.file('page.html');
  var text = (await readFileAsText(await file.async('blob'))).trim();
  assert(text === `\
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

  /* none */
  var options = {
    "capture.downLink.file.mode": "none",
    "capture.downLink.file.extFilter": `txt, bmp, css, html`,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(!zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `${localhost}/capture_downLink_file/file.bmp`);
  assert(anchors[1].getAttribute('href') === `${localhost}/capture_downLink_file/file.css#123`);
  assert(anchors[2].getAttribute('href') === `${localhost}/capture_downLink_file/page.html`);
  assert(anchors[3].getAttribute('href') === `${localhost}/capture_downLink_file/file.txt`);
  assert(anchors[4].getAttribute('href') === `${localhost}/capture_downLink_file/mime.py`);
  assert(anchors[5].getAttribute('href') === `${localhost}/capture_downLink_file/unknown.py`);
  assert(anchors[6].getAttribute('href') === `${localhost}/capture_downLink_file/filename.py`);
  assert(anchors[7].getAttribute('href') === `${localhost}/capture_downLink_file/nofilename.py`);
  assert(anchors[8].getAttribute('href') === `${localhost}/capture_downLink_file/redirect.pyr`);
});

/**
 * Check extFilter syntax
 *
 * capture.downLink.file.extFilter
 */
it('test_capture_downLink_file_extFilter', async function () {
  // a rule each line
  // match URL (*.py) but download using resolved filename using header (*.txt)
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt\nbmp\ncss\npy`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(zip.file("file2.txt"));
  assert(zip.file("unknown.bin"));
  assert(zip.file("file3.txt"));
  assert(zip.file("nofilename.py"));
  assert(!zip.file("file4.txt"));
  assert(Object.keys(zip.files).length === 8);

  // space separator
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt bmp css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("file4.txt"));
  assert(Object.keys(zip.files).length === 4);

  // comma separator
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt,bmp,css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("file4.txt"));
  assert(Object.keys(zip.files).length === 4);

  // semicolon separator
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt;bmp;css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("file4.txt"));
  assert(Object.keys(zip.files).length === 4);

  // combined separator
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt; bmp ,; css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("file4.txt"));
  assert(Object.keys(zip.files).length === 4);

  // match full extension
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `tx, mp, s`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(!zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 1);

  // RegExp rule with flag
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `/(TXT|BMP|CSS)/i`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("file4.txt"));
  assert(Object.keys(zip.files).length === 4);

  // RegExp rule with no flag
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `/(TXT|BMP|CSS)/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(!zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 1);

  // RegExp rule
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `/(?!py).+/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("file4.txt"));
  assert(Object.keys(zip.files).length === 5);

  // match full extension
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `/tx/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(!zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 1);

  // unknown MIME should not match any extension
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `/.*/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(zip.file("file3.txt"));
  assert(zip.file("nofilename.py"));
  assert(zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 9);

  // take URL filename if Content-Disposition without filename
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `//`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(!zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 1);

  // mime: filter
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `\
mime:text/plain
mime:image/bmp
mime:application/wsb.unknown`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(zip.file("file2.txt"));
  assert(zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 6);

  // mime: filter with regex
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `\
mime:/text/.+/i`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 6);

  // mime: filter should not hit if no Content-Type header
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `\
mime:/.*/i`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(zip.file("file2.txt"));
  assert(zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 8);

  // mime: filter should not hit for url mode
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `\
mime:/.*/i`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(!zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 1);
});

/**
 * Check urlFilter syntax
 *
 * capture.downLink.urlFilter
 */
it('test_capture_downLink_file_urlFilter', async function () {
  // a rule each line
  // plain text rule
  // match original URL
  // rule and URL have hash stripped before comparison
  var options = {
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
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(!zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 3);

  // plain text rule must match full URL
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `txt, bmp, css`,
    // 1. should not match
    // 2. should match (hash in URL is stripped)
    "capture.downLink.urlFilter": `\
capture_downLink_file/mime.py
${localhost}/capture_downLink_file/file.css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 6);

  // chars after spaces should be stripped for a plain text rule
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `txt, bmp, css`,
    // 1. should not match
    // 2. should match (hash in URL is stripped)
    "capture.downLink.urlFilter": `\
capture_downLink_file/mime.py  foo
${localhost}/capture_downLink_file/file.css\tbar`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(!zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 6);

  // RegExp rule
  // match original URL
  // match partial URL
  // URL has hash stripped before comparison but rule is not
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `txt, bmp, css`,
    // 1. should match
    // 2. should not match (hash stripped in URL but not in rule)
    "capture.downLink.urlFilter": `\
/[/][^/]+[.]PY$/i
/#.+$/i`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_file/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("file.bmp"));
  assert(zip.file("file.css"));
  assert(!zip.file("page.html"));
  assert(zip.file("file.txt"));
  assert(!zip.file("file2.txt"));
  assert(!zip.file("unknown.bin"));
  assert(!zip.file("file3.txt"));
  assert(!zip.file("nofilename.py"));
  assert(zip.file("redirect.txt"));
  assert(Object.keys(zip.files).length === 5);
});

/**
 * Check basic in-depth capture
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth', async function () {
  /* depth = null */
  var options = {
    "capture.downLink.doc.depth": null,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.documentElement.hasAttribute('data-scrapbook-type'));
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-5.html#`);

  assert(!zip.file('index.json'));

  /* depth = 0 */
  var options = {
    "capture.downLink.doc.depth": 0,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 2);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'site');
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-5.html#`);

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html"
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth/in-depth.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/in-depth.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));

  /* depth = 1 */
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'site');
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `linked1-5.html#`);

  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked2-1.html#1-2`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked2-2.html#1-2`);

  var indexFile = zip.file('linked1-3.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1-1.html#1-3`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-5.html#1-3`);

  var indexFile = zip.file('linked1-4.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `index.html#1-4`);

  var indexFile = zip.file('linked1-5.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  assert(!zip.file('linked2-1.html'));

  assert(!zip.file('linked2-2.html'));

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html"
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth/in-depth.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/in-depth.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      },
      {
        "path": "linked1-1.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-1.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-1.html`, "document")
      },
      {
        "path": "linked1-2.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-2.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-2.html`, "document")
      },
      {
        "path": "linked1-3.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-3.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-3.html`, "document")
      },
      {
        "path": "linked1-4.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-4.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-4.html`, "document")
      },
      {
        "path": "linked1-5.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-5.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-5.html`, "document")
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));

  /* depth = 2 */
  var options = {
    "capture.downLink.doc.depth": 2,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'site');
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `linked1-5.html#`);

  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked2-1.html#1-2`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked2-2.html#1-2`);

  var indexFile = zip.file('linked1-3.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1-1.html#1-3`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-5.html#1-3`);

  var indexFile = zip.file('linked1-4.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `index.html#1-4`);

  var indexFile = zip.file('linked1-5.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  var indexFile = zip.file('linked2-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  var indexFile = zip.file('linked2-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked3-1.html#2-2`);

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html"
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth/in-depth.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/in-depth.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      },
      {
        "path": "linked1-1.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-1.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-1.html`, "document")
      },
      {
        "path": "linked1-2.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-2.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-2.html`, "document")
      },
      {
        "path": "linked1-3.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-3.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-3.html`, "document")
      },
      {
        "path": "linked1-4.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-4.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-4.html`, "document")
      },
      {
        "path": "linked1-5.html",
        "url": `${localhost}/capture_downLink_indepth/linked1-5.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked1-5.html`, "document")
      },
      {
        "path": "linked2-1.html",
        "url": `${localhost}/capture_downLink_indepth/linked2-1.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked2-1.html`, "document")
      },
      {
        "path": "linked2-2.html",
        "url": `${localhost}/capture_downLink_indepth/linked2-2.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth/linked2-2.html`, "document")
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));
});

/**
 * Check no in-depth for singleHtml
 *
 * capture.downLink.doc.depth
 * capture.saveAs
 */
it('test_capture_downLink_indepth_singleHtml', async function () {
  /* depth = 0 */
  var options = {
    "capture.downLink.doc.depth": 0,
    "capture.saveAs": "singleHtml",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assert(!doc.documentElement.hasAttribute('data-scrapbook-type'));
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-4.html#444`);

  /* depth = 1 */
  var options = {
    "capture.downLink.doc.depth": 1,
    "capture.saveAs": "singleHtml",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assert(!doc.documentElement.hasAttribute('data-scrapbook-type'));
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
});

/**
 * Check downLink.file should be skipped for doc if downLink.doc.depth is set
 *
 * capture.downLink.file.mode
 * capture.downLink.file.extFilter
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_skip_file', async function () {
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `bmp, html`,
  };

  /* depth = null */
  options["capture.downLink.doc.depth"] = null;

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `linked1-5.html#`);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `./linked2-1.html#1-2`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `./linked2-2.html#1-2`);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-3.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `./linked1-1.html#1-3`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `./linked1-5.html#1-3`);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-4.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `./in-depth.html#1-4`);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-5.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  // not accessed
  assert(!zip.file('linked2-1.html'));
  assert(!zip.file('linked2-2.html'));

  /* depth = 0 */
  options["capture.downLink.doc.depth"] = 0;

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-5.html#`);

  // skip downLinkFile even if depth exceeds
  assert(!zip.file('linked1-1.html'));
  assert(!zip.file('linked1-2.html'));
  assert(!zip.file('linked1-3.html'));
  assert(!zip.file('linked1-4.html'));
  assert(!zip.file('linked1-5.html'));
  assert(!zip.file('linked2-1.html'));
  assert(!zip.file('linked2-2.html'));

  /* depth = 1 */
  options["capture.downLink.doc.depth"] = 1;

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `linked1-5.html#`);

  // captured as page (rewritten)
  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  // captured as page (rewritten)
  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked2-1.html#1-2`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked2-2.html#1-2`);

  // captured as page (rewritten)
  var indexFile = zip.file('linked1-3.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1-1.html#1-3`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-5.html#1-3`);

  // captured as page (rewritten)
  var indexFile = zip.file('linked1-4.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `index.html#1-4`);

  // captured as page (rewritten)
  var indexFile = zip.file('linked1-5.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  // skip downLinkFile even if depth exceeds
  assert(!zip.file('linked2-1.html'));
  assert(!zip.file('linked2-2.html'));
});

/**
 * Check urlFilter for doc
 *
 * capture.downLink.doc.depth
 * capture.downLink.doc.urlFilter
 */
it('test_capture_downLink_indepth_urlFilter', async function () {
  /* plain URLs */
  var options = {
    "capture.downLink.doc.depth": 2,
    "capture.downLink.doc.urlFilter": `\
${localhost}/capture_downLink_indepth/linked1-2.html
${localhost}/capture_downLink_indepth/linked2-1.html`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-5.html#`);

  assert(!zip.file('linked1-1.html'));

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked2-1.html#1-2`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked2-2.html#1-2`);

  assert(!zip.file('linked1-3.html'));

  assert(!zip.file('linked1-4.html'));

  assert(!zip.file('linked1-5.html'));

  var indexFile = zip.file('linked2-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  assert(!zip.file('linked2-2.html'));

  /* RegExp URLs */
  var options = {
    "capture.downLink.doc.depth": 2,
    "capture.downLink.doc.urlFilter": `/linked1-[12]\.HTML$/i`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked1-5.html#`);

  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked2-1.html#1-2`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth/linked2-2.html#1-2`);

  assert(!zip.file('linked1-3.html'));

  assert(!zip.file('linked1-4.html'));

  assert(!zip.file('linked1-5.html'));

  assert(!zip.file('linked2-1.html'));

  assert(!zip.file('linked2-2.html'));
});

/**
 * Check link rebuild for non-HTML pages (XHTML and SVG)
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_nonHtml', async function () {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth_nonHtml/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1.html`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked2.html`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked3.html`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `subpage1.xhtml`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `subpage2.svg`);

  var indexFile = zip.file('subpage1.xhtml');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1.html`);

  var indexFile = zip.file('subpage2.svg');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked2.html`);
  assert(doc.querySelectorAll('a')[1].getAttribute('xlink:href') === `linked3.html`);
});

/**
 * A page linked from a frame should have same depth as from the main page.
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_frame', async function () {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth_frame/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);

  var indexFile = zip.file('index_1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1.html`);

  var indexFile = zip.file('linked1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);
});

/**
 * Check frame renaming for deep pages.
 *
 * capture.downLink.doc.depth
 * capture.frameRename
 */
it('test_capture_downLink_indepth_renaming', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.downLink.doc.depth": 1,
  };

  /* frameRename = true */
  options["capture.frameRename"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth_renaming/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1.html`);

  var indexFile = zip.file('linked1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `linked1_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `linked1_2.html`);

  /* frameRename = false */
  options["capture.frameRename"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth_renaming/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1.html`);

  var indexFile = zip.file('linked1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `frame1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `frame2.html`);
});

/**
 * Check links in shadow DOMs are rebuilt
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_shadow', async function () {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_shadow/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host = doc.querySelector('div');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelectorAll('a')[0].getAttribute('href') === `linked1.html#111`);

  var host = shadow.querySelector('div');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelectorAll('a')[0].getAttribute('href') === `linked2.html#222`);
});

/**
 * Check links handling for meta refresh
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_metaRefresh', async function () {
  /* depth = 1 */
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_metaRefresh/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1-1.html#in-depth`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-2.html#in-depth`);

  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content') === `0; url=${localhost}/capture_downLink_indepth_metaRefresh/linked2-1.html#linked1-1`);

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content') === `0; url=${localhost}/capture_downLink_indepth_metaRefresh/linked2-2.html`);

  assert(!zip.file('linked2-1.html'));

  assert(!zip.file('linked2-1.html'));

  assert(!zip.file('refreshed.html'));

  /* depth = 3 */
  var options = {
    "capture.downLink.doc.depth": 3,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_metaRefresh/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1-1.html#in-depth`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-2.html#in-depth`);

  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content') === `0; url=linked2-1.html#linked1-1`);

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content') === `0; url=linked2-2.html`);

  var indexFile = zip.file('linked2-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content') === `0; url=refreshed.html#linked2-1`);

  var indexFile = zip.file('linked2-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content') === `0; url=linked1-2.html`);

  assert(zip.file('refreshed.html'));
});

/**
 * Check links handling for redirect
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_redirect', async function () {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_redirect/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `redirected.html#in-depth`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth_redirect/linked1-2.pyr#in-depth`);
});

/**
 * Check URL should be removed for data: in index.json
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_datauri', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.downLink.doc.depth": 0,
    "capture.saveDataUriAsFile": true,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_datauri/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `test.bmp`);

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html"
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth_datauri/in-depth.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth_datauri/in-depth.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      },
      {
       "path": "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp",
       "role": "resource",
       "token": "53724543b9eec02e09e333bf253affae8bbf71d4"
      },
      {
       "path": "test.bmp",
       "role": "resource",
       "token": "273f4b77f14df7c6f331c0cd1ee01746e41797e7"
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));
});

/**
 * Check URL should be removed for blob: in index.json
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_blob', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.downLink.doc.depth": 0,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_blob/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  }, {delay: 500});

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var imgElems = doc.querySelectorAll('img');
  var imgFn =imgElems[0].getAttribute('src');
  var imgFn1 =imgElems[1].getAttribute('src');
  var imgFn2 =imgElems[2].getAttribute('src');
  assert(imgFn === imgFn1);
  assert(imgFn !== imgFn2);

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html"
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth_blob/in-depth.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth_blob/in-depth.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      },
      {
       "path": imgFn,
       "role": "resource",
       "token": getToken(`blob:${localhost}/${imgFn.slice(0, -4)}`, "resource")
      },
      {
       "path": imgFn2,
       "role": "resource",
       "token": getToken(`blob:${localhost}/${imgFn2.slice(0, -4)}`, "resource")
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));
});

/**
 * Check URL should be kept as-is for about: URLs.
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_about', async function () {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_about/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `about:blank`);
  assert(anchors[1].getAttribute('href') === `about:blank?foo=bar#baz`);
  assert(anchors[2].getAttribute('href') === `about:srcdoc`);
  assert(anchors[3].getAttribute('href') === `about:invalid`);

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html"
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth_about/in-depth.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth_about/in-depth.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));
});

/**
 * Links rebuilding should safely skip invalid URLs.
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_invalid', async function () {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_invalid/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `https://exa%23mple.org/`);
  assert(anchors[1].getAttribute('href') === `https://#fragment`);
  assert(anchors[2].getAttribute('href') === `https://:443`);
  assert(anchors[3].getAttribute('href') === `https://example.org:70000`);
  assert(anchors[4].getAttribute('href') === `https://example.org:7z`);

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html"
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth_invalid/in-depth.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth_invalid/in-depth.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));
});

/**
 * An attachment page should be download as a file and not captured.
 * Also check that links in an embedded SVG or MathML are handled correctly.
 *
 * capture.downLink.file.mode
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_attachment', async function () {
  /* downLink */
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": "html",
    "capture.downLink.doc.depth": 0,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_attachment/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file('red.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth_attachment/attachment1.py#in-depth`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `attachment1.html#in-depth`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `attachment2.html#in-depth`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `attachment2-2.html#in-depth`);
  assert(doc.querySelectorAll('svg a')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth_attachment/attachment3.html#in-depth`);
  assert(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href') === `${localhost}/capture_downLink_indepth_attachment/attachment4.html#in-depth`);
  assert(doc.querySelectorAll('math [href]')[0].getAttribute('href') === `${localhost}/capture_downLink_indepth_attachment/attachment5.html#in-depth`);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('attachment1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./red.bmp"]'));

  // downloaded as file (not rewritten)
  var indexFile = zip.file('attachment2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./red.bmp"]'));

  // downloaded as file (not rewritten)
  var indexFile = zip.file('attachment2-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./red.bmp"]'));

  /* inDepth */
  var options = {
    "capture.downLink.file.mode": "none",
    "capture.downLink.doc.depth": 1,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_attachment/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.file('attachment2.py'));
  assert(!zip.file('attachment2-2.py'));
  assert(zip.file('red.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `attachment1.html#in-depth`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink_indepth_attachment/attachment1.py#in-depth`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink_indepth_attachment/attachment2.py#in-depth`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink_indepth_attachment/attachment2-2.py#in-depth`);
  assert(doc.querySelectorAll('svg a')[0].getAttribute('href') === `attachment3.html#in-depth`);
  assert(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href') === `attachment4.html#in-depth`);
  assert(doc.querySelectorAll('math [href]')[0].getAttribute('href') === `attachment5.html#in-depth`);

  // captured as page (rewritten)
  var indexFile = zip.file('attachment1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="red.bmp"]'));

  // captured as page (rewritten)
  var indexFile = zip.file('attachment3.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="red.bmp"]'));

  // captured as page (rewritten)
  var indexFile = zip.file('attachment4.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="red.bmp"]'));

  // captured as page (rewritten)
  var indexFile = zip.file('attachment5.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="red.bmp"]'));

  /* downLink & inDepth */
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": "html",
    "capture.downLink.doc.depth": 1,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_attachment/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('red.bmp'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `attachment1-1.html#in-depth`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `attachment1.html#in-depth`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `attachment2.html#in-depth`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `attachment2-2.html#in-depth`);
  assert(doc.querySelectorAll('svg a')[0].getAttribute('href') === `attachment3.html#in-depth`);
  assert(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href') === `attachment4.html#in-depth`);
  assert(doc.querySelectorAll('math [href]')[0].getAttribute('href') === `attachment5.html#in-depth`);

  // captured as page (rewritten)
  var indexFile = zip.file('attachment1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="red.bmp"]'));

  // downloaded as file (not rewritten)
  var indexFile = zip.file('attachment1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./red.bmp"]'));

  // downloaded as file (not rewritten)
  var indexFile = zip.file('attachment2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./red.bmp"]'));

  // downloaded as file (not rewritten)
  var indexFile = zip.file('attachment2-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./red.bmp"]'));

  // captured as page (rewritten)
  var indexFile = zip.file('attachment3.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="red.bmp"]'));

  // captured as page (rewritten)
  var indexFile = zip.file('attachment4.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="red.bmp"]'));

  // captured as page (rewritten)
  var indexFile = zip.file('attachment5.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="red.bmp"]'));
});

/**
 * Check option capture.downLink.urlExtra
 *
 * capture.downLink.urlExtra
 * capture.downLink.file.mode
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_urlExtra', async function () {
  var options = {
    "capture.downLink.file.extFilter": "jpg",
    "capture.downLink.doc.urlFilter": "/(?!)/",
    "capture.downLink.urlFilter": "//",
    "capture.downLink.urlExtra": `\
${localhost}/capture_downLink_indepth_urlExtra/1-1.html
${localhost}/capture_downLink_indepth_urlExtra/1-2.py
${localhost}/capture_downLink_indepth_urlExtra/1-3.txt`,
  };

  /* -downLink -inDepth */
  options["capture.downLink.file.mode"] = "none";
  options["capture.downLink.doc.depth"] = null;

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index.html'));
  assert(!zip.file('index.json'));
  assert(!zip.file('1-1.html'));
  assert(!zip.file('1-1.bmp'));
  assert(!zip.file('1-2.html'));
  assert(!zip.file('1-2.bmp'));
  assert(!zip.file('1-3.txt'));

  /* +downLink -inDepth */
  options["capture.downLink.file.mode"] = "url";
  options["capture.downLink.doc.depth"] = null;

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index.html'));
  assert(!zip.file('index.json'));
  assert(!zip.file('1-1.bmp'));
  assert(!zip.file('1-2.bmp'));
  assert(zip.file('1-3.txt'));

  // downloaded as file (not rewritten)
  var indexFile = zip.file('1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./1-1.bmp"]'));

  // downloaded as file (not rewritten)
  var indexFile = zip.file('1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./1-2.bmp"]'));

  /* -downLink +inDepth */
  options["capture.downLink.file.mode"] = "none";
  options["capture.downLink.doc.depth"] = 0;

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index.html'));
  assert(zip.file('1-1.bmp'));
  assert(!zip.file('1-2.html'));
  assert(!zip.file('1-2.bmp'));
  assert(!zip.file('1-3.txt'));

  // captured as page (rewritten)
  var indexFile = zip.file('1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="1-1.bmp"]'));

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html",
      "1-1.html",
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/main.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      },
      {
        "path": "1-1.html",
        "url": `${localhost}/capture_downLink_indepth_urlExtra/1-1.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-1.html`, "document")
      },
      {
        "path": "1-1.bmp",
        "url": `${localhost}/capture_downLink_indepth_urlExtra/1-1.bmp`,
        "role": "resource",
        "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-1.bmp`, "resource")
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));

  /* +downLink +inDepth */
  options["capture.downLink.file.mode"] = "url";
  options["capture.downLink.doc.depth"] = 0;

  var blob = await capture({
    url: `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index.html'));
  assert(zip.file('1-1.bmp'));
  assert(!zip.file('1-2.bmp'));
  assert(zip.file('1-3.txt'));

  // captured as page (rewritten)
  var indexFile = zip.file('1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="1-1.bmp"]'));

  // downloaded as file (not rewritten)
  var indexFile = zip.file('1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img[src="./1-2.bmp"]'));

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html",
      "1-1.html",
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/main.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      },
      {
        "path": "1-2.html",
        "url": `${localhost}/capture_downLink_indepth_urlExtra/1-2.py`,
        "role": "resource",
        "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-2.py`, "resource")
      },
      {
        "path": "1-3.txt",
        "url": `${localhost}/capture_downLink_indepth_urlExtra/1-3.txt`,
        "role": "resource",
        "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-3.txt`, "resource")
      },
      {
        "path": "1-1.html",
        "url": `${localhost}/capture_downLink_indepth_urlExtra/1-1.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-1.html`, "document")
      },
      {
        "path": "1-1.bmp",
        "url": `${localhost}/capture_downLink_indepth_urlExtra/1-1.bmp`,
        "role": "resource",
        "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-1.bmp`, "resource")
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));
});

/**
 * Check if case is preserved for the paths in index.json
 *
 * capture.downLink.doc.depth
 */
it('test_capture_downLink_indepth_case', async function () {
  var options = {
    "capture.downLink.doc.depth": 1,
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `bmp`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink_indepth_case/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 5);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('img').getAttribute('src') === `Green.bmp`);

  var sitemapBlob = await zip.file('index.json').async('blob');
  var expectedData = {
    "version": 3,
    "indexPages": [
      "index.html"
    ],
    "files": [
      {
        "path": "index.json"
      },
      {
        "path": "index.dat"
      },
      {
        "path": "index.rdf"
      },
      {
        "path": "history.rdf"
      },
      {
        "path": "^metadata^"
      },
      {
        "path": "index.html",
        "url": `${localhost}/capture_downLink_indepth_case/index.html`,
        "role": "document",
        "token": getToken(`${localhost}/capture_downLink_indepth_case/index.html`, "document")
      },
      {
        "path": "index.xhtml",
        "role": "document"
      },
      {
        "path": "index.svg",
        "role": "document"
      },
      {
        "path": "Green.bmp",
        "url": `${localhost}/capture_downLink_indepth_case/Green.bmp`,
        "role": "resource",
        "token": getToken(`${localhost}/capture_downLink_indepth_case/Green.bmp`, "resource")
      },
      {
       "path": "Yellow.bmp",
       "url": `${localhost}/capture_downLink_indepth_case/Yellow.bmp`,
       "role": "resource",
       "token": getToken(`${localhost}/capture_downLink_indepth_case/Yellow.bmp`, "resource")
      },
      {
       "path": "Linked.html",
       "url": `${localhost}/capture_downLink_indepth_case/Linked.html`,
       "role": "document",
       "token": getToken(`${localhost}/capture_downLink_indepth_case/Linked.html`, "document")
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));
});

/**
 * Check if linked blob URL files and pages can be correctly captured.
 *
 * capture.downLink.file.mode
 * capture.downLink.file.extFilter
 */
it('test_capture_downLink_blob', async function () {
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `bmp`,
    "capture.downLink.doc.depth": 1,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_blob/basic.html`,
    options: Object.assign({}, baseOptions, options),
  }, {delay: 500});
  var uuid = r`[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}`;

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgFn = doc.querySelector('#file1 a').getAttribute('href');
  assert(imgFn.match(regex`^${uuid}\.bmp$`));
  assert(zip.file(imgFn));

  var page1Fn = doc.querySelector('#page1 a').getAttribute('href');
  assert(page1Fn.match(regex`^${uuid}\.html$`));

  var indexFile = zip.file(page1Fn);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgFn1 = doc.querySelector('img').getAttribute('src');
  assert(imgFn1 === imgFn);
});

/**
 * Check if blob URLs in a deep page can be correctly captured.
 *
 * capture.downLink.file.mode
 * capture.downLink.file.extFilter
 */
$it.xfailIf(
  userAgent.is('firefox'),
  'Fetching a blob URL generated in a page from an extension page is not allowed in Firefox',
)('test_capture_downLink_blob_deep', async function () {
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `bmp`,
    "capture.downLink.doc.depth": 2,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink_blob/basic.html`,
    options: Object.assign({}, baseOptions, options),
  }, {delay: 500});
  var uuid = r`[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}`;

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgFn = doc.querySelector('#file1 a').getAttribute('href');
  assert(imgFn.match(regex`^${uuid}\.bmp$`));
  assert(zip.file(imgFn));

  var page1Fn = doc.querySelector('#page1 a').getAttribute('href');
  assert(page1Fn.match(regex`^${uuid}\.html$`));

  var indexFile = zip.file(page1Fn);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgFn1 = doc.querySelector('img').getAttribute('src');
  assert(imgFn1 === imgFn);
  var imgFn2 = doc.querySelectorAll('img')[1].getAttribute('src');
  assert(zip.file(imgFn2));

  var page11Fn = doc.querySelector('a').getAttribute('href');
  assert(page11Fn.match(regex`^${uuid}\.html$`));

  var indexFile = zip.file(page11Fn);
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgFn11 = doc.querySelector('img').getAttribute('src');
  assert(imgFn11 === imgFn);
});

/**
 * Check if option works.
 *
 * - The original value of "data-scrapbook-" attributes should NOT be recorded.
 *
 * capture.recordDocumentMeta
 * capturer.captureDocument
 * capturer.captureFile
 * capturer.captureBookmark
 */
it('test_capture_record_meta', async function () {
  var options = {
    "capture.recordRewrites": true,
  };

  /* html; +capture.recordDocumentMeta */
  options["capture.recordDocumentMeta"] = true;
  var blob = await capture({
    url: `${localhost}/capture_record/meta.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var html = doc.documentElement;

  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.html`);
  assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
  assertNoRecord(html, {filter: 'scrapbook'});

  /* html; -capture.recordDocumentMeta */
  options["capture.recordDocumentMeta"] = false;
  var blob = await capture({
    url: `${localhost}/capture_record/meta.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assertNoRecord(doc, {filter: {regexAttr: /^data-scrapbook-/}});

  /* text (Big5); +capture.recordDocumentMeta */
  options["capture.recordDocumentMeta"] = true;
  var blob = await capture({
    url: `${localhost}/capture_record/text.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var html = doc.documentElement;

  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/text.py`);
  assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
  assert(html.getAttribute('data-scrapbook-type') === 'file');
  assert(html.getAttribute('data-scrapbook-charset') === 'Big5');
  assertNoRecord(html, {filter: 'scrapbook'});

  /* text (Big5); -capture.recordDocumentMeta */
  options["capture.recordDocumentMeta"] = false;
  var blob = await capture({
    url: `${localhost}/capture_record/text.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assertNoRecord(doc, {filter: {regexAttr: /^data-scrapbook-/}});

  /* bookmark; +capture.recordDocumentMeta */
  options["capture.recordDocumentMeta"] = true;
  var blob = await capture({
    url: `${localhost}/capture_record/meta.html`,
    mode: "bookmark",
    options: Object.assign({}, baseOptions, options),
  });
  var doc = await readFileAsDocument(blob);
  var html = doc.documentElement;

  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.html`);
  assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
  assert(html.getAttribute('data-scrapbook-type') === 'bookmark');
  assertNoRecord(html, {filter: 'scrapbook'});

  /* bookmark; -capture.recordDocumentMeta */
  options["capture.recordDocumentMeta"] = false;
  var blob = await capture({
    url: `${localhost}/capture_record/meta.html`,
    mode: "bookmark",
    options: Object.assign({}, baseOptions, options),
  });
  var doc = await readFileAsDocument(blob);

  assertNoRecord(doc, {filter: {regexAttr: /^data-scrapbook-/}});
});

/**
 * Check if hash is recorded in main document and NOT in frames
 *
 * capture.recordDocumentMeta
 * capturer.captureDocument
 * capturer.captureFile
 * capturer.captureBookmark
 */
it('test_capture_record_meta_hash', async function () {
  /* html */
  var options = {
    "capture.recordDocumentMeta": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_record/frame.html#abc`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/frame.html#abc`);

  var frameFile = zip.file('index_1.html');
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(frameBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.html`);

  /* html; headless */
  var options = {
    "capture.recordDocumentMeta": true,
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_record/frame.html#abc`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/frame.html#abc`);

  var frameFile = zip.file('index_1.html');
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(frameBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.html`);

  /* file */
  var options = {
    "capture.recordDocumentMeta": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_record/text.py#abc`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/text.py#abc`);

  /* file; headless */
  var options = {
    "capture.recordDocumentMeta": true,
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_record/text.py#abc`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/text.py#abc`);

  /* bookmark */
  var options = {
    "capture.recordDocumentMeta": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_record/meta.html#abc`,
    mode: "bookmark",
    options: Object.assign({}, baseOptions, options),
  });
  var doc = await readFileAsDocument(blob);
  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.html#abc`);
});

/**
 * The recorded URL should be the redirected one.
 *
 * capture.recordDocumentMeta
 * capturer.captureDocument
 * capturer.captureFile
 * capturer.captureBookmark
 */
it('test_capture_record_meta_redirect', async function () {
  /* html; +capture.recordDocumentMeta */
  var options = {
    "capture.recordDocumentMeta": true,
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_record/meta.pyr#abc`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var html = doc.documentElement;

  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.html#abc`);
});

/**
 * Record metadata in index.html rather than in *.xhtml (except for source)
 *
 * capture.recordDocumentMeta
 * capturer.captureDocument
 */
it('test_capture_record_meta_xhtml', async function () {
  /* html; +capture.recordDocumentMeta */
  var options = {
    "capture.recordDocumentMeta": true,
    "capture.downLink.doc.depth": 0,
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_record/meta.xhtml#abc`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var html = doc.documentElement;
  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.xhtml#abc`);
  assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
  assert(html.getAttribute('data-scrapbook-type') === `site`);

  var indexFile = zip.file('index.xhtml');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
  var doc = await readFileAsDocument(indexBlob);
  var html = doc.documentElement;
  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.xhtml`);
  assertNoRecord(html, {filter: {regexAttr: /^data-scrapbook-(?!source)/}});
});

/**
 * Check if removed nodes are recorded
 *
 * capture.recordRewrites
 * capturer.captureDocument
 */
it('test_capture_record_nodes_removed', async function () {
  var options = {
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
  };

  /* +capture.recordRewrites */
  options["capture.recordRewrites"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/nodes1.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var head = doc.querySelector('head');
  var body = doc.body;
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(head.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<base[^>]*?>-->`
  ));

  assert(head.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="shortcut icon"[^>]*?>-->`
  ));

  assert(head.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="stylesheet"[^>]*?>-->`
  ));

  assert(head.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="preload"[^>]*?>-->`
  ));

  assert(head.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="prefetch"[^>]*?>-->`
  ));

  assert(head.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<script[^>]*?>[\s\S]*?</script>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<img[^>]*? src=[^>]*?>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<img[^>]*? srcset=[^>]*?>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<picture>[\s\S]*?</picture>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<input[^>]*? type="image"[^>]*?>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<canvas[^>]*?>[\s\S]*?</canvas>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<audio[^>]*?>[\s\S]*?</audio>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<video[^>]*?>[\s\S]*?</video>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<video[^>]*?>[\s\S]*?</video>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<embed[^>]*?>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<object[^>]*?>[\s\S]*?</object>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<applet[^>]*?>[\s\S]*?</applet>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<iframe[^>]*?>[\s\S]*?</iframe>-->`
  ));

  assert(body.innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<noscript[^>]*?>[\s\S]*?</noscript>-->`
  ));

  /* -capture.recordRewrites */
  options["capture.recordRewrites"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/nodes1.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assertNoRecord(doc);
});

/**
 * Check for removed source nodes in picture, audio, and video
 *
 * capture.recordRewrites
 * capturer.captureDocument
 */
it('test_capture_record_nodes_removed_source', async function () {
  var options = {
    "capture.image": "save-current",
    "capture.audio": "save-current",
    "capture.video": "save-current",
  };

  /* +capture.recordRewrites */
  options["capture.recordRewrites"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/nodes2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('picture').innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`
  ));

  assert(doc.querySelector('audio').innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`
  ));

  assert(doc.querySelector('video').innerHTML.match(
    regex`<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`
  ));

  /* -capture.recordRewrites */
  options["capture.recordRewrites"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/nodes2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assertNoRecord(doc);
});

/**
 * Check if added nodes are recorded.
 *
 * capture.recordRewrites
 * capturer.captureDocument
 */
it('test_capture_record_nodes_added', async function () {
  var options = {
    "capture.image": "save-current",
    "capture.audio": "save-current",
    "capture.video": "save-current",
  };

  /* +capture.recordRewrites */
  options["capture.recordRewrites"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/nodes3.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
  assert(doc.querySelector(`head:not([data-scrapbook-orig-null-node-${timeId}])`));
  assert(doc.querySelector(`meta[charset="UTF-8"][data-scrapbook-orig-null-node-${timeId}]`));

  var blob = await capture({
    url: `${localhost}/capture_record/nodes4.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
  assert(doc.querySelector(`head[data-scrapbook-orig-null-node-${timeId}]`));
  assert(doc.querySelector(`meta[charset="UTF-8"][data-scrapbook-orig-null-node-${timeId}]`));

  /* -capture.recordRewrites */
  options["capture.recordRewrites"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/nodes3.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assertNoRecord(doc);

  var blob = await capture({
    url: `${localhost}/capture_record/nodes4.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assertNoRecord(doc);
});

/**
 * Check if changed attributes are recorded
 *
 * This only checks for a subset of captures to verify that no record is
 * generated when the option is not set.  Other record details should be tested
 * in the related tests, which mostly checks only for
 * capture.recordRewrites = true, with the presumption that every record is
 * generated through an option-aware function like captureRewriteAttr().
 *
 * capture.recordRewrites
 * capturer.captureDocument
 */
it('test_capture_record_attrs', async function () {
  var options = {
    "capture.frame": "save",
    "capture.styleInline": "blank",
    "capture.rewriteCss": "url",
    "capture.script": "blank",
    "capture.formStatus": "keep",
  };

  /* +capture.recordRewrites */
  options["capture.recordRewrites"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs1.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('meta').getAttribute(`data-scrapbook-orig-attr-charset-${timeId}`) === `Big5`);
  assert(doc.querySelector('body').getAttribute(`data-scrapbook-orig-attr-onload-${timeId}`) === `console.log('load');`);
  assert(doc.querySelector('div').getAttribute(`data-scrapbook-orig-attr-style-${timeId}`) === `background-color: green;`);
  assert(doc.querySelector('iframe').getAttribute(`data-scrapbook-orig-attr-srcdoc-${timeId}`) === `frame page content`);
  assert(doc.querySelector('a').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `javascript:console.log('a');`);
  assert(doc.querySelector('input[type="checkbox"]').getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assert(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`) === ``);
  assert(doc.querySelector('select option').getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`) === ``);

  /* -capture.recordRewrites */
  options["capture.recordRewrites"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs1.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assertNoRecord(doc);
});

/**
 * Check for changed attributes: save case
 *
 * capture.recordRewrites
 * capturer.captureDocument
 * capturer.DocumentCssHandler
 */
it('test_capture_record_attrs_save', async function () {
  var options = {
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
  };

  /* +capture.recordRewrites */
  options["capture.recordRewrites"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(doc.querySelector('link[rel="preload"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.css`);
  assert(doc.querySelector('link[rel="preload"]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`) === `2726c7f26c`);
  assert(!doc.querySelector('link[rel="preload"]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(doc.querySelector('link[rel="preload"]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`) === `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
  assert(doc.querySelector('link[rel="prefetch"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null2.css`);
  assert(doc.querySelector('link[rel="prefetch"]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`) === `2726c7f26c`);
  assert(!doc.querySelector('link[rel="prefetch"]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(doc.querySelector('link[rel="preload"]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`) === `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`) === `2726c7f26c`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === `anonymous`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`) === `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.css`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`) === `2726c7f26c`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === ``);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`) === `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
  assert(doc.querySelector('script[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.js`);
  assert(doc.querySelector('script[src]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`) === `2726c7f26c`);
  assert(doc.querySelector('script[src]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === `use-credentials`);
  assert(doc.querySelector('script[src]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`) === `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
  assert(doc.querySelector('script:not([src])').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`) === `2726c7f26c`);
  assert(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === ``);
  assert(doc.querySelector('img[srcset]').getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `./null.bmp 1x, ./null.bmp 2x`);
  assert(doc.querySelector('img[srcset]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === ``);
  assert(doc.querySelector('picture source').getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === ``);
  assert(doc.querySelector('input[type="image"]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('table').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('table tr').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('table tr th').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('table tr td').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.mp3`);
  assert(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === ``);
  assert(doc.querySelector('audio:not([src])').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === ``);
  assert(doc.querySelector('audio source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.ogg`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.mp4`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-poster-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === ``);
  assert(doc.querySelector('video:not([src])').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === ``);
  assert(doc.querySelector('video source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.webm`);
  assert(doc.querySelector('iframe').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.html`);
  assert(doc.querySelector('embed').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.swf`);
  assert(doc.querySelector('object').getAttribute(`data-scrapbook-orig-attr-data-${timeId}`) === `./null.swf`);
  assert(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-code-${timeId}`) === `./null.class`);
  assert(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-archive-${timeId}`) === `./null.jar`);
  assert(doc.querySelector('a').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.txt`);

  assert(doc.querySelectorAll('svg a[*|href]')[0].getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.txt`);
  assert(doc.querySelectorAll('svg a[*|href]')[1].getAttribute(`xlink:data-scrapbook-orig-attr-href-${timeId}`) === `./null.txt`);
  assert(doc.querySelectorAll('svg image[*|href]')[0].getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.bmp`);
  assert(doc.querySelectorAll('svg image[*|href]')[1].getAttribute(`xlink:data-scrapbook-orig-attr-href-${timeId}`) === `./null.bmp`);

  // CSS
  assert(doc.querySelector('style').textContent.trim() === `@import /*scrapbook-orig-url="./null.css"*/url("null.css");
@font-face { font-family: myFont; src: /*scrapbook-orig-url="./null.woff"*/url("null.woff"); }
p { background-image: /*scrapbook-orig-url="./null.bmp"*/url("null.bmp"); }`);
  assert(doc.querySelector('div').getAttribute('style') === `background: /*scrapbook-orig-url="./null.bmp"*/url("null.bmp");`);

  /* -capture.recordRewrites */
  options["capture.recordRewrites"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // attr
  assertNoRecord(doc);

  // CSS
  assert(doc.querySelector('style').textContent.trim() === `@import url("null.css");
@font-face { font-family: myFont; src: url("null.woff"); }
p { background-image: url("null.bmp"); }`);
  assert(doc.querySelector('div').getAttribute('style') === `background: url("null.bmp");`);
});

/**
 * Check for changed attributes: blank case
 * (save styles to save CSS and check image background and font)
 *
 * capture.recordRewrites
 * capturer.captureDocument
 * capturer.DocumentCssHandler
 */
it('test_capture_record_attrs_blank', async function () {
  var options = {
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
  };

  /* +capture.recordRewrites */
  options["capture.recordRewrites"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.bmp`);
  assert(doc.querySelectorAll('script')[0].getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.js`);
  assert(doc.querySelectorAll('script')[0].getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`) === `2726c7f26c`);
  assert(doc.querySelectorAll('script')[1].getAttribute(`data-scrapbook-orig-textContent-${timeId}`).trim() === `console.log('script:not[src]');`);
  assert(doc.querySelectorAll('script')[1].getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`) === `2726c7f26c`);
  assert(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `./null.bmp 1x, ./null.bmp 2x`);
  assert(doc.querySelector('picture source').getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('input[type="image"]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('table').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('table tr').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('table tr th').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('table tr td').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.mp3`);
  assert(doc.querySelector('audio source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.ogg`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.mp4`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-poster-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('video source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.webm`);
  assert(doc.querySelector('iframe').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.html`);
  assert(doc.querySelector('embed').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.swf`);
  assert(doc.querySelector('object').getAttribute(`data-scrapbook-orig-attr-data-${timeId}`) === `./null.swf`);
  assert(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-code-${timeId}`) === `./null.class`);
  assert(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-archive-${timeId}`) === `./null.jar`);

  // CSS
  assert(doc.querySelector('style').textContent.trim() === `@import /*scrapbook-orig-url="./null.css"*/url("null.css");
@font-face { font-family: myFont; src: /*scrapbook-orig-url="./null.woff"*/url(""); }
p { background-image: /*scrapbook-orig-url="./null.bmp"*/url(""); }`);
  assert(doc.querySelector('div').getAttribute('style') === `background: /*scrapbook-orig-url="./null.bmp"*/url("");`);

  /* -capture.recordRewrites */
  options["capture.recordRewrites"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // attr
  assertNoRecord(doc);

  // CSS
  assert(doc.querySelector('style').textContent.trim() === `@import url("null.css");
@font-face { font-family: myFont; src: url(""); }
p { background-image: url(""); }`);
  assert(doc.querySelector('div').getAttribute('style') === `background: url("");`);
});

/**
 * Check for changed attributes: save-current case
 * (and blank style)
 *
 * capture.recordRewrites
 * capturer.captureDocument
 * capturer.DocumentCssHandler
 */
it('test_capture_record_attrs_save_current', async function () {
  var options = {
    "capture.image": "save-current",
    "capture.audio": "save-current",
    "capture.video": "save-current",
    "capture.style": "blank",
  };

  /* +capture.recordRewrites */
  options["capture.recordRewrites"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.css`);
  assert(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`) === ``);
  assert(doc.querySelectorAll('img')[1].getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `./null.bmp 1x, ./null.bmp 2x`);
  assert(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.bmp`);
  assert(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.mp3`);
  assert(doc.querySelectorAll('audio')[1].getAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`) === ``);
  assert(!doc.querySelectorAll('audio')[1].getAttribute(`data-scrapbook-orig-attr-src-${timeId}`)); // double record bug
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `./null.mp4`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-poster-${timeId}`) === `./null.bmp`);
  assert(doc.querySelectorAll('video')[1].getAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`) === ``);
  assert(!doc.querySelectorAll('video')[1].getAttribute(`data-scrapbook-orig-attr-src-${timeId}`)); // double record bug

  /* -capture.recordRewrites */
  options["capture.recordRewrites"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // attr
  assertNoRecord(doc);
});

/**
 * Check for changed attributes: for base
 *
 * capture.recordRewrites
 * capturer.captureDocument
 * capturer.DocumentCssHandler
 */
it('test_capture_record_attrs_base', async function () {
  var options = {
    "capture.recordRewrites": true,
  };

  /* save */
  options["capture.base"] = "save";

  var blob = await capture({
    url: `${localhost}/capture_record/attrs3.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('base').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.html`);

  /* blank */
  options["capture.base"] = "blank";

  var blob = await capture({
    url: `${localhost}/capture_record/attrs3.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('base').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `./null.html`);
});

/**
 * Check if option works: for normal URL
 *
 * capture.linkUnsavedUri
 * capturer.captureDocument
 * capturer.downloadFile
 * capturer.captureUrl
 * capturer.captureBookmark
 */
it('test_capture_linkUnsavedUri', async function () {
  var options = {
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
  };

  /* -capture.linkUnsavedUri */
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error1.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('style').textContent.trim() === `@import url("urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.css");
@font-face { font-family: myFont; src: url("urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.woff"); }
p { background-image: url("urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp"); }`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('href') === `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.css`);
  assert(doc.querySelector('script').getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.js`);
  assert(doc.querySelector('img').getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp`);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp 1x, urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp 2x`);
  assert(doc.querySelector('iframe').getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.html`);

  /* +capture.linkUnsavedUri */
  options["capture.linkUnsavedUri"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error1.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('style').textContent.trim() === `@import url("${localhost}/capture_linkUnsavedUri/nonexist.css");
@font-face { font-family: myFont; src: url("${localhost}/capture_linkUnsavedUri/nonexist.woff"); }
p { background-image: url("${localhost}/capture_linkUnsavedUri/nonexist.bmp"); }`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('href') === `${localhost}/capture_linkUnsavedUri/nonexist.bmp`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === `${localhost}/capture_linkUnsavedUri/nonexist.css`);
  assert(doc.querySelector('script').getAttribute('src') === `${localhost}/capture_linkUnsavedUri/nonexist.js`);
  assert(doc.querySelector('img').getAttribute('src') === `${localhost}/capture_linkUnsavedUri/nonexist.bmp`);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `${localhost}/capture_linkUnsavedUri/nonexist.bmp 1x, ${localhost}/capture_linkUnsavedUri/nonexist.bmp 2x`);
  assert(doc.querySelector('iframe').getAttribute('src') === `${localhost}/capture_linkUnsavedUri/nonexist.html`);
});

/**
 * Test for downLink
 *
 * capture.linkUnsavedUri
 * capture.downLink.file.mode
 */
it('test_capture_linkUnsavedUri_downLink', async function () {
  var options = {
    "capture.downLink.file.extFilter": "txt",
    "capture.downLink.urlFilter": "",
  };

  /* -capture.linkUnsavedUri */
  options["capture.downLink.file.mode"] = "url";
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // downLink, error
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.txt`);

  // no downLink, no error
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_linkUnsavedUri/nonexist.css`);

  /* -capture.linkUnsavedUri */
  options["capture.downLink.file.mode"] = "header";
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // text/html => no downLink, no error
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_linkUnsavedUri/nonexist.txt`);

  // no downLink, no error
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_linkUnsavedUri/nonexist.css`);

  /* +capture.linkUnsavedUri */
  options["capture.downLink.file.mode"] = "url";
  options["capture.linkUnsavedUri"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_linkUnsavedUri/nonexist.txt`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_linkUnsavedUri/nonexist.css`);
});

/**
 * Test for "" URL:
 * Don't generate error URL for non-absolute URLs.
 *
 * capture.linkUnsavedUri
 * capturer.captureDocument
 * capturer.downloadFile
 * capturer.captureUrl
 * capturer.captureBookmark
 */
it('test_capture_linkUnsavedUri_empty', async function () {
  var options = {
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
  };

  /* -capture.linkUnsavedUri */
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error3.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('style').textContent.trim() === `@import url("");
@font-face { font-family: myFont; src: url(""); }
p { background-image: url(""); }`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('href') === ``);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === ``);
  assert(doc.querySelector('script').getAttribute('src') === ``);
  assert(doc.querySelector('img').getAttribute('src') === ``);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === ``);
  assert(doc.querySelector('iframe').getAttribute('src') === ``);
  assert(doc.querySelector('a').getAttribute('href') === ``);
});

/**
 * Test for hash URL:
 * Don't generate error URL for non-absolute URLs.
 *
 * capture.linkUnsavedUri
 * capturer.captureDocument
 * capturer.downloadFile
 * capturer.captureUrl
 * capturer.captureBookmark
 */
it('test_capture_linkUnsavedUri_hash', async function () {
  var options = {
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
  };

  /* -capture.linkUnsavedUri */
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error4.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('style').textContent.trim() === `@import url("#123");
@font-face { font-family: myFont; src: url("#123"); }
p { background-image: url("#123"); }`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('href') === `#123`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === `#123`);
  assert(doc.querySelector('script').getAttribute('src') === `#123`);
  assert(doc.querySelector('img').getAttribute('src') === `#123`);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `#123 1x, #123 2x`);
  assert(doc.querySelector('iframe').getAttribute('src') === `#123`);
  assert(doc.querySelector('a').getAttribute('href') === `#123`);
});

/**
 * Test for non-resolvable URL:
 * Don't generate error URL for non-absolute URLs.
 *
 * capture.linkUnsavedUri
 * capturer.captureDocument
 * capturer.downloadFile
 * capturer.captureUrl
 * capturer.captureBookmark
 */
it('test_capture_linkUnsavedUri_nonResolvable', async function () {
  var options = {
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
  };

  /* -capture.linkUnsavedUri */
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error5.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frameFile = zip.file(doc.querySelector('iframe').getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(frameBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('style').textContent.trim() === `@import url("nonexist.css");
@font-face { font-family: myFont; src: url("nonexist.woff"); }
p { background-image: url("nonexist.bmp"); }`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('href') === `nonexist.bmp`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === `nonexist.css`);
  assert(doc.querySelector('script').getAttribute('src') === `nonexist.js`);
  assert(doc.querySelector('img').getAttribute('src') === `nonexist.bmp`);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `nonexist.bmp 1x, nonexist.bmp 2x`);
  assert(doc.querySelector('iframe').getAttribute('src') === `nonexist.html`);
  assert(doc.querySelector('a').getAttribute('href') === `nonexist.txt`);
  assert(doc.querySelector('a[name]').getAttribute('href') === `nonexist.css`);
});

/**
 * Test for other protocol URL:
 * Don't generate error URL if the protocol is not http, https, file, or about
 *
 * capture.linkUnsavedUri
 * capturer.captureDocument
 * capturer.downloadFile
 * capturer.captureUrl
 * capturer.captureBookmark
 */
it('test_capture_linkUnsavedUri_protocol', async function () {
  var options = {
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
  };

  /* -capture.linkUnsavedUri */
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error6.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('style').textContent.trim() === `@import url("ftp://example.com/nonexist.css");
@font-face { font-family: myFont; src: url("ftp://example.com/nonexist.woff"); }
p { background-image: url("ftp://example.com/nonexist.bmp"); }`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('href') === `ftp://example.com/nonexist.bmp`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === `ftp://example.com/nonexist.css`);
  assert(doc.querySelector('script').getAttribute('src') === `ftp://example.com/nonexist.js`);
  assert(doc.querySelector('img').getAttribute('src') === `ftp://example.com/nonexist.bmp`);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `ftp://example.com/nonexist.bmp 1x, ftp://example.com/nonexist.bmp 2x`);
  assert(doc.querySelector('iframe').getAttribute('src') === `ftp://example.com/nonexist.html`);
  assert(doc.querySelector('a').getAttribute('href') === `ftp://example.com/nonexist.txt`);
  assert(doc.querySelector('a[name]').getAttribute('href') === `mailto:nonexist@example.com`);
});

/**
 * Test for blob URL:
 * Record briefly for data and blob URL.
 *
 * capture.linkUnsavedUri
 * capturer.captureDocument
 * capturer.downloadFile
 * capturer.captureUrl
 * capturer.captureBookmark
 */
it('test_capture_linkUnsavedUri_blob', async function () {
  var options = {
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
  };

  /* -capture.linkUnsavedUri */
  options["capture.linkUnsavedUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_linkUnsavedUri/error7.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === `urn:scrapbook:download:error:blob:`);
  assert(doc.querySelector('script').getAttribute('src') === `urn:scrapbook:download:error:blob:`);
  assert(doc.querySelector('img').getAttribute('src') === `urn:scrapbook:download:error:blob:`);
});

/**
 * Test if option works.
 *
 * capture.insertInfoBar
 */
it('test_capture_insertInfoBar', async function () {
  var options = {};

  /* +capture.insertInfoBar */
  options["capture.insertInfoBar"] = true;

  var blob = await capture({
    url: `${localhost}/capture_insertInfoBar/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('script[data-scrapbook-elem="infobar-loader"]'));

  /* -capture.insertInfoBar */
  options["capture.insertInfoBar"] = false;

  var blob = await capture({
    url: `${localhost}/capture_insertInfoBar/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('script[data-scrapbook-elem="infobar-loader"]'));
});

/**
 * Size limit should be applied to normal resource and CSS.
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
it('test_capture_sizeLimit', async function () {
  var options = {
    "capture.style": "save",
    "capture.image": "save",
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": "txt",
    "capture.downLink.doc.depth": 1,
    "capture.downLink.urlFilter": "",
  };

  /* sizeLimit = null */
  options["capture.resourceSizeLimit"] = null;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('link.css'));
  assert(zip.file('link2.css'));
  assert(zip.file('img.bmp'));
  assert(zip.file('img2.bmp'));
  assert(zip.file('linked.txt'));
  assert(zip.file('linked2.txt'));
  assert(zip.file('linked.html'));
  assert(zip.file('linked2.html'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('link')[0].getAttribute('href') === `link.css`);
  assert(doc.querySelectorAll('link')[1].getAttribute('href') === `link2.css`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `img.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `img2.bmp`);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked.txt`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked2.txt`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked.html`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `linked2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = false */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('link.css'));
  assert(!zip.file('link2.css'));
  assert(zip.file('img.bmp'));
  assert(!zip.file('img2.bmp'));
  assert(zip.file('linked.txt'));
  assert(!zip.file('linked2.txt'));
  assert(zip.file('linked.html'));
  assert(!zip.file('linked2.html'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('link')[0].getAttribute('href') === `link.css`);
  assert(doc.querySelectorAll('link')[1].getAttribute('href') === `urn:scrapbook:download:error:${localhost}/capture_sizeLimit/link2.css`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `img.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_sizeLimit/img2.bmp`);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked.txt`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `urn:scrapbook:download:error:${localhost}/capture_sizeLimit/linked2.txt`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked.html`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_sizeLimit/linked2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = true */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = true;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('link.css'));
  assert(!zip.file('link2.css'));
  assert(zip.file('img.bmp'));
  assert(!zip.file('img2.bmp'));
  assert(zip.file('linked.txt'));
  assert(!zip.file('linked2.txt'));
  assert(zip.file('linked.html'));
  assert(!zip.file('linked2.html'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('link')[0].getAttribute('href') === `link.css`);
  assert(doc.querySelectorAll('link')[1].getAttribute('href') === `${localhost}/capture_sizeLimit/link2.css`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `img.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `${localhost}/capture_sizeLimit/img2.bmp`);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked.txt`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_sizeLimit/linked2.txt`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked.html`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_sizeLimit/linked2.html`);
});

/**
 * Size limit should be applied to headless frames.
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
it('test_capture_sizeLimit_frame', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.frame": "save",
  };

  /* sizeLimit = null */
  options["capture.resourceSizeLimit"] = null;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit_frame/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index_1.html'));
  assert(zip.file('index_2.html'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = false */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit_frame/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index_1.html'));
  assert(zip.file('index_2.html'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = true */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = true;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit_frame/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index_1.html'));
  assert(zip.file('index_2.html'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = null; headless */
  options["capture.resourceSizeLimit"] = null;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit_frame/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index_1.html'));
  assert(zip.file('index_2.html'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = false; headless */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit_frame/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index_1.html'));
  assert(!zip.file('index_2.html'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_sizeLimit_frame/iframe2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = true; headless */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit_frame/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file('index_1.html'));
  assert(!zip.file('index_2.html'));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `${localhost}/capture_sizeLimit_frame/iframe2.html`);
});

/**
 * Size limit should NOT be applied to data URL.
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
it('test_capture_sizeLimit_datauri', async function () {
  var options = {
    "capture.style": "save",
    "capture.image": "save",
  };

  /* sizeLimit = 1KB */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit_datauri/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('link')[0].getAttribute('href') === `e06bed7af2c6b885afd226014f801aaba2e355f7.css`);
  assert(doc.querySelectorAll('link')[1].getAttribute('href') === `275502e8b8f6089c3b23980127a4b237c92ebd91.css`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `f3c161973c06d37459e1fa3e14b78387fd4216f7.svg`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `5aa9b03760d4bac901b27efe48a29b210d0bc6ec.svg`);

  /* sizeLimit = 1KB; headless */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;
  options["capture.saveDataUriAsFile"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit_datauri/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('link')[0].getAttribute('href') === `e06bed7af2c6b885afd226014f801aaba2e355f7.css`);
  assert(doc.querySelectorAll('link')[1].getAttribute('href') === `275502e8b8f6089c3b23980127a4b237c92ebd91.css`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `f3c161973c06d37459e1fa3e14b78387fd4216f7.svg`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `5aa9b03760d4bac901b27efe48a29b210d0bc6ec.svg`);
});

/**
 * Size limit should NOT be applied to data URL (for frames).
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
it('test_capture_sizeLimit_frame_datauri', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.frame": "save",
  };

  /* sizeLimit = 1KB */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;
  options["capture.saveDataUriAsFile"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit_frame_datauri/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = 1KB; headless */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit_frame_datauri/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);
});

/**
 * Size limit should NOT be applied to srcdoc.
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
it('test_capture_sizeLimit_frame_srcdoc', async function () {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.frame": "save",
  };

  /* sizeLimit = 1KB */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit_frame_srcdoc/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = 1KB; headless */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit_frame_srcdoc/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);
});

/**
 * Check if capture helper works correctly.
 *
 * capturer.helpersEnabled
 * capture.helpers
 */
it('test_capture_helpers_basic', async function () {
  /* capture.helpers set and enabled */
  var options = {
    "capture.helpersEnabled": true,
    "capture.helpers": `\
[
  {
    "commands": [
      ["remove", "#exclude, .exclude, img"],
      ["options", {"capture.style": "remove"}]
    ]
  }
]`,
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(!zip.file("red.bmp"));
  assert(!zip.file("green.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('style'));
  assert(!doc.querySelector('#exclude'));
  assert(!doc.querySelector('.exclude'));
  assert(!doc.querySelector('img'));

  /* capture.helpers set and enabled (debug = true, debugging commands) */
  var options = {
    "capture.helpersEnabled": true,
    "capture.helpers": `\
[
  {
    "debug": true,
    "commands": [
      ["*remove", "#exclude, .exclude, img"],
      ["*options", {"capture.style": "remove"}]
    ]
  }
]`,
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(!zip.file("red.bmp"));
  assert(!zip.file("green.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('style'));
  assert(!doc.querySelector('#exclude'));
  assert(!doc.querySelector('.exclude'));
  assert(!doc.querySelector('img'));

  /* capture.helpers set and enabled (debug = false, debugging commands) */
  var options = {
    "capture.helpersEnabled": true,
    "capture.helpers": `\
[
  {
    "debug": false,
    "commands": [
      ["*remove", "#exclude, .exclude, img"],
      ["*options", {"capture.style": "remove"}]
    ]
  }
]`,
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(!zip.file("red.bmp"));
  assert(!zip.file("green.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('style'));
  assert(!doc.querySelector('#exclude'));
  assert(!doc.querySelector('.exclude'));
  assert(!doc.querySelector('img'));

  /* capture.helpers set and not enabled */
  var options = {
    "capture.helpersEnabled": false,
    "capture.helpers": `\
[
  {
    "commands": [
      ["remove", "#exclude, .exclude, img"],
      ["options", {"capture.style": "remove"}]
    ]
  }
]`,
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("red.bmp"));
  assert(zip.file("green.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style'));
  assert(doc.querySelector('#exclude'));
  assert(doc.querySelector('.exclude'));
  assert(doc.querySelector('img'));

  /* capture.helpers not set */
  var options = {
    "capture.helpersEnabled": true,
    "capture.helpers": "",
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("red.bmp"));
  assert(zip.file("green.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style'));
  assert(doc.querySelector('#exclude'));
  assert(doc.querySelector('.exclude'));
  assert(doc.querySelector('img'));

  /* capture.helpers invalid (regard as not set) */
  var options = {
    "capture.helpersEnabled": true,
    "capture.helpers": `[bad syntax]`,
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/basic/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("red.bmp"));
  assert(zip.file("green.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style'));
  assert(doc.querySelector('#exclude'));
  assert(doc.querySelector('.exclude'));
  assert(doc.querySelector('img'));
});

/**
 * Check nested capture helper.
 *
 * capturer.helpersEnabled
 * capture.helpers
 */
it('test_capture_helpers_nesting', async function () {
  var options = {
    "capture.helpersEnabled": true,
    "capture.helpers": `\
[
  {
    "commands": [
      ["attr", {"css": "img[data-src]"}, "src", ["get_attr", null, "data-src"]]
    ]
  }
]`,
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/nesting/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.file("index.html"));
  assert(zip.file("green.bmp"));
  assert(!zip.file("red.bmp"));

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('img[src="green.bmp"]'));
});

});  // Capture tests

}));
