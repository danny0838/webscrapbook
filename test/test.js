'use strict';

/**
 * Configs
 */
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
  "capture.removeHidden": "none",
  "capture.linkUnsavedUri": false,
  "capture.downLink.file.mode": "none",
  "capture.downLink.file.extFilter": "",
  "capture.downLink.doc.depth": null,
  "capture.downLink.doc.delay": null,
  "capture.downLink.doc.urlFilter": "",
  "capture.downLink.urlFilter": "",
  "capture.referrerPolicy": "strict-origin-when-cross-origin",
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
 * Tests
 */

/**
 * Check html saving structure in various formats
 * Check if saveAs option works
 *
 * capture.saveAs
 * capturer.saveDocument
 * capturer.downloadBlob
 */
async function test_capture_html() {
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
  assert(topdir.match(/^\d{17}\/$/));

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
  assert(blob.type.match(/^text\/html(?:;|$)/));

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
}

/**
 * Check meta charset is correctly rewritten
 *
 * capturer.saveDocument
 */
async function test_capture_metaCharset() {
  /* meta new */
  var blob = await capture({
    url: `${localhost}/capture_metaCharset/big5.html`,
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

  /* meta old */
  var blob = await capture({
    url: `${localhost}/capture_metaCharset/big5-old.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.title === 'ABC 中文');
  assert(doc.querySelector('meta[content="text/html; charset=UTF-8"]'));

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem.getAttribute('src') === `圖片.bmp`);

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem.getAttribute('src') === `圖片.bmp`);

  /* no meta charset; HTTP header Big5 */
  var blob = await capture({
    url: `${localhost}/capture_metaCharset/big5-header.py`,
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
}

/**
 * URLs different only in hash should be considered identical.
 *
 * capturer.downloadFile
 */
async function test_capture_rename() {
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
}

/**
 * Check URL normalization.
 *
 * capturer.access
 */
async function test_capture_rename2() {
  var blob = await capture({
    url: `${localhost}/capture_rename2/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 3);
  assert(zip.files["index.html"]);
  assert(zip.files["abc.bmp"]);
  assert(zip.files["123ABCabc中文 !#$%&'()+,-;=@[]^_`{}-.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}-.bmp");
  assert(imgs[1].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}-.bmp");
  assert(imgs[2].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}-.bmp");
  assert(imgs[3].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}-.bmp");
  assert(imgs[4].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}-.bmp");
  assert(imgs[5].getAttribute('src') === "abc.bmp#abc%E4%B8%AD%E6%96%87%");
  assert(imgs[6].getAttribute('src') === "abc.bmp#ab%63%e4%b8%ad%e6%96%87%25");
}

/**
 * Check xhtml saving structure in various formats
 * Check if saveAs option works
 *
 * capture.saveAs
 * capturer.saveDocument
 * capturer.downloadBlob
 */
async function test_capture_xhtml() {
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
  assert(blob.type.match(/^application\/xhtml\+xml(?:;|$)/));

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
}

/**
 * Check file saving structure in various formats
 * Check if saveAs option works
 *
 * capturer.captureFile
 */
async function test_capture_file() {
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
  assert(metaRefreshElem.getAttribute('content') === "0; url=" 
      + "data:image/bmp;filename=file.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
  assert(!doc.querySelector('a[href="file.bmp"]')); // do NOT generate anchor to avoid long content
  assert(!doc.querySelector('img'));
}

/**
 * Check plain text file encoding is correctly recorded
 *
 * capturer.captureFile
 */
async function test_capture_file_charset() {
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
}

/**
 * Check saved filename is correctly determined by HTTP header
 * (filename, filename with encoding, or content-type)
 *
 * Check plain text file encoding is correctly recorded
 */
async function test_capture_header() {
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

  // filename*=UTF-8''...
  var savedFile = zip.file('中文𠀀.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

  // content-type; no file extension (should generate one)
  var savedFile = zip.file('noext.bmp');
  assert(savedFile);
  var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
  assert(b64 === "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
}

/**
 * If filename by URL path or header doesn't match its MIME type,
 * a fixing extension should be appended.
 *
 * capturer.downloadFile
 */
async function test_capture_header_mime() {
  var blob = await capture({
    url: `${localhost}/capture_header_mime/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('img')[0].getAttribute("src") === "image_bmp.py.bmp")
  assert(zip.files["image_bmp.py.bmp"]);
  assert(doc.querySelectorAll('img')[1].getAttribute("src") === "image_svg.py.svg")
  assert(zip.files["image_svg.py.svg"]);

  // extension validation should be case-insensitive
  assert(doc.querySelectorAll('img')[2].getAttribute("src") === "image.SVG")
  assert(zip.files["image.SVG"]);

  // a well-known MIME may have a new-age extension not known yet, don't overfix
  assert(doc.querySelectorAll('img')[3].getAttribute("src") === "newext.mp1")
  assert(zip.files["newext.mp1"]);

  // always attempt to fix for a file without extension
  assert(doc.querySelectorAll('img')[4].getAttribute("src") === "noext.doc")
  assert(zip.files["noext.doc"]);

  // allow empty extension for universal MIME types, e.g. application/octet-stream
  assert(doc.querySelectorAll('img')[5].getAttribute("src") === "noextoctet")
  assert(zip.files["noextoctet"]);

  assert(doc.querySelectorAll('link')[0].getAttribute("href") === "stylesheet.py.css")
  assert(zip.files["stylesheet.py.css"]);
  assert(doc.querySelectorAll('script')[0].getAttribute("src") === "script.py.js")
  assert(zip.files["script.py.js"]);
}

/**
 * Check special char handling for saved resources
 *
 * scrapbook.validateFilename
 * scrapbook.escapeFilename
 */
async function test_capture_filename() {
  var blob = await capture({
    url: `${localhost}/capture_filename/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["_"]);
  assert(zip.files["abc"]);
  assert(zip.files["_.bin"]);
  assert(zip.files["abcd"]);
  assert(zip.files["abcde.bin"]);
  assert(zip.files["abcdef"]);
  assert(zip.files["123ABCabc中文 !#$%&'()+,-;=@[]^_`{}-"]);
  assert(zip.files["中文 !_#$%&'()_+,-__;(=)_@[_]^_`{_}-"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === "_");
  assert(imgs[1].getAttribute('src') === "abc");
  assert(imgs[2].getAttribute('src') === "_.bin");
  assert(imgs[3].getAttribute('src') === "abcd");
  assert(imgs[4].getAttribute('src') === "abcde.bin");
  assert(imgs[5].getAttribute('src') === "abcdef");
  assert(imgs[6].getAttribute('src') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}-");
  assert(imgs[7].getAttribute('src') === "中文%20!_%23$%25&'()_+,-__;(=)_@[_]^_`{_}-");
}

/**
 * Check renaming for forbidden files
 *
 * capturer.getUniqueFilename
 * capturer.captureInfo.*.files
 */
async function test_capture_filename2() {
  var blob = await capture({
    url: `${localhost}/capture_filename2/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index-1.json"]);
  assert(zip.files["index-1.dat"]);
  assert(zip.files["index-1.rdf"]);
  assert(zip.files["^metadata^-1"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === "index-1.json");
  assert(imgs[1].getAttribute('src') === "index-1.dat");
  assert(imgs[2].getAttribute('src') === "index-1.rdf");
  assert(imgs[3].getAttribute('src') === "^metadata^-1");
}

/**
 * Check if option works
 *
 * capture.saveAsciiFilename
 * capture.saveDataUriAsFile
 */
async function test_capture_saveAsciiFilename() {
  /* -saveAsciiFilename */
  var options = {
    "capture.saveAsciiFilename": false,
  };
  var blob = await capture({
    url: `${localhost}/capture_saveAsciiFilename/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['123ABCabc_中文_𠀀.bmp']);
  assert(zip.files['123ABCabc_中文_𠀀-2.bmp']);
  assert(zip.files['123ABCabc_中文_𠀀.css']);
  assert(zip.files['123ABCabc_中文_𠀀.woff']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href') === "123ABCabc_中文_𠀀.bmp");
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === "123ABCabc_中文_𠀀.css");
  assert(doc.querySelector('style').textContent.trim() === `@import url("123ABCabc_中文_𠀀.css");
@font-face { font-family: myFont; src: url("123ABCabc_中文_𠀀.woff"); }
p { background-image: url("123ABCabc_中文_𠀀.bmp"); }`);
  assert(doc.querySelector('img').getAttribute('src') === "123ABCabc_中文_𠀀.bmp");
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === "123ABCabc_中文_𠀀.bmp 1x, 123ABCabc_中文_𠀀-2.bmp 2x");

  /* +saveAsciiFilename */
  var options = {
    "capture.saveAsciiFilename": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_saveAsciiFilename/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80.bmp']);
  assert(zip.files['123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80-2.bmp']);
  assert(zip.files['123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80.css']);
  assert(zip.files['123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80.woff']);

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
  assert(doc.querySelector('img').getAttribute('src') === "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp");
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp 1x, 123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580-2.bmp 2x");
}

/**
 * Check if option works
 *
 * capture.saveFileAsHtml
 */
async function test_capture_saveFileAsHtml() {
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
}

/**
 * Check if option works
 *
 * capture.saveDataUriAsFile
 */
async function test_capture_dataUri() {
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
  assert(zip.files['2206b4fb7241bdce17a71015c888e3de66c2b5c9.css']);
  assert(zip.files['da39a3ee5e6b4b0d3255bfef95601890afd80709.woff']);
  assert(zip.files['ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp']);
  assert(zip.files['4c46aef7be4ed4dda8cb2e887ae3ca7a8702fa16.bmp']);

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
}

/**
 * Check URL resolution in a data URL CSS
 *
 * capture.saveDataUriAsFile
 * capturer.downloadFile
 * capturer.DocumentCssHandler
 */
async function test_capture_dataUri2() {
  var options = {
    "capture.style": "save",
    "capture.font": "save",
    "capture.imageBackground": "save",
  };

  /* -saveDataUriAsFile; relative link in data URL CSS */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri2/resolve-css-1.html`,
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
    url: `${localhost}/capture_dataUri2/resolve-css-2.html`,
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
@import "data:text/css;filename=null.css,";
@font-face { font-family: myFont; src: url("data:font/woff;filename=null.woff;base64,"); }
p { background-image: url("data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"); }`);

  /* +saveDataUriAsFile; relative link in data URL CSS */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri2/resolve-css-1.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 2); // main + link css

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file(doc.querySelector('link').getAttribute('href'));
  var cssBlob = new Blob([await cssFile.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(cssBlob)).trim();
  assert(text === `\
@import "null.css";
@font-face { font-family: invalid; src: url("null.woff"); }
#invalid { background-image: url("red.bmp"); }`);

  /* +saveDataUriAsFile; absolute link in data URL CSS */
  // absolute link => save as file
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri2/resolve-css-2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['null.css']);
  assert(zip.files['null.woff']);
  assert(zip.files['red.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file(doc.querySelector('link').getAttribute('href'));
  var cssBlob = new Blob([await cssFile.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(cssBlob)).trim();
  assert(text === `\
@import "null.css";
@font-face { font-family: myFont; src: url("null.woff"); }
p { background-image: url("red.bmp"); }`);
}

/**
 * Check URL resolution in a data URL frame
 *
 * capture.saveDataUriAsFile
 * capturer.captureDocument
 */
async function test_capture_dataUri3() {
  var options = {
    "capture.frame": "save",
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": "txt",
    "capture.downLink.urlFilter": "",
    "capture.saveDataUriAsSrcdoc": false,
  };

  /* -saveDataUriAsFile; relative link in data URL iframe */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri3/resolve-frame-1.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

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

  /* -saveDataUriAsFile; absolute link in data URL iframe */
  // absolute link => force saved as a data URL (relative link won't work if saved as file)
  options["capture.saveDataUriAsFile"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri3/resolve-frame-2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frameSrc = doc.querySelector('iframe').getAttribute('src');
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

  assert(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
  assert(frameDoc.querySelector('img').getAttribute('src') === `data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`);
  assert(frameDoc.querySelector('a').getAttribute('href') === `data:text/plain;filename=null.txt,`);

  /* +saveDataUriAsFile; relative link in data URL iframe */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri3/resolve-frame-1.html`,
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

  /* +saveDataUriAsFile; absolute link in data URL iframe */
  // absolute link => save as file
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri3/resolve-frame-2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["red.bmp"]);
  assert(zip.files["null.txt"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frameSrc = doc.querySelector('iframe').getAttribute('src');
  var frameFile = zip.file(frameSrc);
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  assert(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
  assert(frameDoc.querySelector('img[src="red.bmp"]'));
  assert(frameDoc.querySelector('a[href="null.txt"]'));
}

/**
 * Check support of parameters in a data URL
 *
 * capture.saveDataUriAsFile
 */
async function test_capture_dataUri4() {
  var blob = await capture({
    url: `${localhost}/capture_dataUri4/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.rdf.css"]);
  assert(zip.files["index.dat.css"]);
  assert(zip.files["^metadata^.css"]);

  assert(zip.files["abc.html"]);
  assert(zip.files["abc.xml"]);
  assert(zip.files["abc.bmp"]);
  assert(zip.files["abc.jpeg"]);
  assert(zip.files["abc.gif"]);
  assert(zip.files["abc.png"]);
  assert(zip.files["abc.svg"]);
  assert(zip.files["abc.wav"]);
  assert(zip.files["abcd.wav"]);
  assert(zip.files["abc.mp3"]);
  assert(zip.files["abc.oga"]);
  assert(zip.files["abc.ogx"]);
  assert(zip.files["abc.mpga"]);
  assert(zip.files["abc.mp4"]);
  assert(zip.files["abc.webm"]);
  assert(zip.files["abc.ogv"]);

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
}

/**
 * Check if capture selection works
 *
 * capturer.captureDocument
 */
async function test_capture_selection() {
  var blob = await capture({
    url: `${localhost}/capture_selection/index.html`,
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
  assert(zip.files["green.bmp"]);

  assert(selectedParentElem.firstChild.nodeType === 8);
  assert(selectedParentElem.firstChild.nodeValue === 'scrapbook-capture-selected');
  assert(selectedParentElem.lastChild.nodeType === 8);
  assert(selectedParentElem.lastChild.nodeValue === '/scrapbook-capture-selected');

  // non-selected elements and resources
  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.files["red.bmp"]);

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.files["blue.bmp"]);
}

/**
 * Test selecting single node
 *
 * capturer.captureDocument
 */
async function test_capture_selection2() {
  var blob = await capture({
    url: `${localhost}/capture_selection/index2.html`,
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
  assert(zip.files["green.bmp"]);

  assert(selectedElem.previousSibling.nodeType === 8);
  assert(selectedElem.previousSibling.nodeValue === 'scrapbook-capture-selected');
  assert(selectedElem.nextSibling.nodeType === 8);
  assert(selectedElem.nextSibling.nodeValue === '/scrapbook-capture-selected');

  // non-selected elements and resources
  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.files["red.bmp"]);

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.files["blue.bmp"]);
}

/**
 * Test selecting text node
 *
 * capturer.captureDocument
 */
async function test_capture_selection3() {
  var blob = await capture({
    url: `${localhost}/capture_selection/index3.html`,
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
  assert(!zip.files["green.bmp"]);

  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.files["red.bmp"]);

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.files["blue.bmp"]);
}

/**
 * Test selecting comment node
 *
 * capturer.captureDocument
 */
async function test_capture_selection4() {
  var blob = await capture({
    url: `${localhost}/capture_selection/index4.html`,
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
  assert(!zip.files["green.bmp"]);

  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.files["red.bmp"]);

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.files["blue.bmp"]);
}

/**
 * Test selecting CDATA node
 *
 * capturer.captureDocument
 */
async function test_capture_selection5() {
  var blob = await capture({
    url: `${localhost}/capture_selection/index5.xhtml`,
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
  assert(!zip.files["green.bmp"]);

  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.files["red.bmp"]);

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.files["blue.bmp"]);
}

/**
 * Test multiple selections
 *
 * capturer.captureDocument
 */
async function test_capture_selection6() {
  var blob = await capture({
    url: `${localhost}/capture_selection/index6.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  // Some browsers support multiple selection (e.g. Firefox), while some don't
  // Skip test if not support.
  if (!doc.querySelector('#selection2')) {
    return;
  }

  // selected elements and resources
  assert(doc.querySelector('#selection'));
  assert(doc.querySelector('#selected'));
  assert(doc.querySelector('img[src="green.bmp"]'));
  assert(zip.files["green.bmp"]);

  assert(doc.querySelector('#selection2'));
  assert(doc.querySelector('#selected2'));
  assert(doc.querySelector('img[src="yellow.bmp"]'));
  assert(zip.files["yellow.bmp"]);

  // non-selected elements and resources
  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.files["red.bmp"]);

  assert(!doc.querySelector('#middle'));

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.files["blue.bmp"]);
}

/**
 * Test multiple selections of text and comment
 *
 * capturer.captureDocument
 */
async function test_capture_selection7() {
  var blob = await capture({
    url: `${localhost}/capture_selection/index7.xhtml`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.xhtml');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
  var doc = await readFileAsDocument(indexBlob);

  // Some browsers support multiple selection (e.g. Firefox), while some don't
  // Skip test if not support.
  if (!doc.querySelector('#selection2')) {
    return;
  }

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
  assert(!zip.files["green.bmp"]);

  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.files["red.bmp"]);

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.files["blue.bmp"]);
}

/**
 * A delay time for tab capture is required to wait for favicon loading
 * complete.
 *
 * capturer.captureTab
 * capturer.captureHeadless
 */
async function test_capture_headless() {
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
  assert(!zip.files["red.bmp"]);

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
  assert(!zip.files["red.bmp"]);

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
    mode: "source",
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector(`title`));
  assert(!doc.querySelector(`link[rel~="icon"]`));
  assert(!zip.files["red.bmp"]);

  /* from URL; bookmark */
  var blob = await captureHeadless({
    url: `${localhost}/capture_headless/tab-info.html`,
    mode: "bookmark",
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);
  assert(!doc.querySelector(`title`));
  assert(!doc.querySelector(`link[rel~="icon"]`));
}

/**
 * Check if captureBookmark works
 *
 * capturer.captureBookmark
 */
async function test_capture_bookmark() {
  var blob = await capture({
    url: `${localhost}/capture_bookmark/index.html`,
    mode: "bookmark",
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);

  var html = doc.documentElement;
  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_bookmark/index.html`);
  assert(html.getAttribute('data-scrapbook-create').match(/^\d{17}$/));
  assert(html.getAttribute('data-scrapbook-type') === 'bookmark');

  assert(doc.querySelector(`meta[http-equiv="refresh"][content="0; url=${localhost}/capture_bookmark/index.html"]`));
  assert(doc.querySelector(`a[href="${localhost}/capture_bookmark/index.html"]`));
  assert(doc.querySelector(`link[rel="shortcut icon"][href="data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"]`));
}

/**
 * Check frame capture if same origin
 *
 * capture.frame
 */
async function test_capture_frame() {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  options["capture.frame"]  = "save";

  var blob = await capture({
    url: `${localhost}/capture_frame/same-origin.html`,
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
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost}/capture_frame/same-origin.html`);

  // text.txt
  var frame = frames[3];
  assert(frame.getAttribute('src') === 'text.txt');
  var frameFile = zip.file(frame.getAttribute('src'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");

  /* capture.frame = link */
  options["capture.frame"]  = "link";

  var blob = await capture({
    url: `${localhost}/capture_frame/same-origin.html`,
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
    url: `${localhost}/capture_frame/same-origin.html`,
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
    url: `${localhost}/capture_frame/same-origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('iframe').length === 0);
}

/**
 * Check frame capture if cross origin
 *
 * capture.frame
 */
async function test_capture_frame2() {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  // Capture the frame content via content script and messaging.
  // The result should be same as same origin if it works normally.
  options["capture.frame"]  = "save";

  var blob = await capture({
    url: `${localhost}/capture_frame/cross-origin.py`,
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
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost2}/capture_frame/same-origin.html`);

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
}

/**
 * Check frame capture if srcdoc
 *
 * capture.frame
 */
async function test_capture_frame3() {
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

  /* capture.frame = remove */
  // same as same origin
}

/**
 * Check duplication and hash handling
 *
 * capture.frame
 */
async function test_capture_frame4() {
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
}

/**
 * Check headless frame save if same origin
 *
 * capture.frame
 */
async function test_capture_frame_headless() {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  // frame contents are source (not modified by scripts) due to headless capture
  options["capture.frame"]  = "save";

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/same-origin.html`,
    mode: "source",
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
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost}/capture_frame/same-origin.html`);

  var frame = frames[3];
  assert(frame.getAttribute('src') === 'text.txt');
  var frameFile = zip.file(frame.getAttribute('src'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
}

/**
 * Check headless frame save if srcdoc
 *
 * capture.frame
 */
async function test_capture_frame_headless2() {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  /* capture.frame = save */
  // srcdoc content should be rewritten, with source URL with an SHA checksum
  options["capture.frame"]  = "save";

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/srcdoc.html`,
    mode: "source",
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
  assert(frameDoc.querySelector('html[data-scrapbook-source="about:srcdoc?sha1=d5b4a943636aa76ec3822ea02bac52a7bef28cce"]'));
  assert(frameDoc.querySelector('p').textContent.trim() === `srcdoc content`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var imgFile = zip.file('red.bmp');
  assert(imgFile);
  var imgData = await imgFile.async('base64');
  assert(imgData === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  // frame[srcdoc] should be ignored (left unchanged) and its src should be used
  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/srcdoc2.html`,
    mode: "source",
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
document.querySelector('p').textContent = 'srcdoc content modified';
</script>`);
  assert(frame.getAttribute('src') === `index_1.html`);

  /* capture.frame = link */
  // record resolved src and save rewritten srcdoc
  // resources in srcdoc should be saved as data URL
  options["capture.frame"]  = "link";

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/srcdoc.html`,
    mode: "source",
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

  // frame[srcdoc] should be ignored (left unchanged) and its src should be used
  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/srcdoc2.html`,
    mode: "source",
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
document.querySelector('p').textContent = 'srcdoc content modified';
</script>`);
  assert(frame.getAttribute('src') === `${localhost}/capture_frame/frames/frame1.html`);
}

/**
 * Check headless frame capture if point to self
 *
 * capture.frame
 */
async function test_capture_frame_headless3() {
  /* capture.frame = save */
  var options = {
    "capture.frame": "save",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/self.html`,
    mode: "source",
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
}

/**
 * Check duplication and hash handling
 *
 * capture.frame
 */
async function test_capture_frame_headless4() {
  /* capture.frame = save */
  var options = {
    "capture.frame": "save",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/duplicate.html`,
    mode: "source",
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
}

/**
 * Check data URI output for frame capture.
 *
 * - Use original filename.
 *
 * capture.frame
 * capture.saveDataUriAsSrcdoc
 */
async function test_capture_frame_singleHtml() {
  /* capture.saveDataUriAsSrcdoc = true */
  // data URI charset should be UTF-8
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.frame": "save",
    "capture.saveDataUriAsSrcdoc": true,
  };

  var blob = await capture({
    url: `${localhost}/capture_frame/same-origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('iframe');

  var frameSrc = `data:text\/html;charset=UTF-8,${encodeURIComponent(frames[0].getAttribute('srcdoc'))}`;
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);

  var frameSrc = frames[1].getAttribute('src');
  assert(frameSrc.match(/^data:application\/xhtml\+xml;charset=UTF-8;filename=frame2\.xhtml,/));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);

  var frameSrc = frames[2].getAttribute('src');
  assert(frameSrc.match(/^data:image\/svg\+xml;charset=UTF-8;filename=frame3\.svg,/));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost}/capture_frame/same-origin.html`);

  var frameSrc = frames[3].getAttribute('src');
  assert(frameSrc.match(/^data:text\/plain;filename=text\.txt,/));
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
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=frame1\.html,/));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);

  var frameSrc = frames[1].getAttribute('src');
  assert(frameSrc.match(/^data:application\/xhtml\+xml;charset=UTF-8;filename=frame2\.xhtml,/));
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
    url: `${localhost}/capture_frame/same-origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('iframe');

  var frameSrc = frames[0].getAttribute('src');
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=frame1\.html,/));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);

  var frameSrc = frames[1].getAttribute('src');
  assert(frameSrc.match(/^data:application\/xhtml\+xml;charset=UTF-8;filename=frame2\.xhtml,/));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);

  var frameSrc = frames[2].getAttribute('src');
  assert(frameSrc.match(/^data:image\/svg\+xml;charset=UTF-8;filename=frame3\.svg,/));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost}/capture_frame/same-origin.html`);

  var frameSrc = frames[3].getAttribute('src');
  assert(frameSrc.match(/^data:text\/plain;filename=text\.txt,/));
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
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=frame1\.html,/));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);

  var frameSrc = frames[1].getAttribute('src');
  assert(frameSrc.match(/^data:application\/xhtml\+xml;charset=UTF-8;filename=frame2\.xhtml,/));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);
}

/**
 * Check data URI output for duplicated references
 *
 * - Filename parameter of data URL should not be uniquified.
 * - data URL should not contain a hash.
 *
 * capture.frame
 */
async function test_capture_frame_singleHtml2() {
  /* capture.saveDataUriAsSrcdoc = true */
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.frame": "save",
    "capture.saveDataUriAsSrcdoc": true,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/duplicate.html`,
    mode: "source",
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
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('iframe');

  assert(frames[0].getAttribute('src') === frames[1].getAttribute('src'));
  assert(frames[0].getAttribute('src') === frames[2].getAttribute('src'));
  assert(frames[3].getAttribute('src') === frames[4].getAttribute('src'));
}

/**
 * Check if circular frame referencing is handled correctly
 *
 * capture.frame
 */
async function test_capture_frame_circular() {
  /* capture.saveAs = zip */
  // link to corresponding downloaded frame file
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "zip",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular/index.html`,
    mode: "source",
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
    mode: "source",
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
    mode: "source",
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
}

/**
 * Check if self-pointing circular frame referencing is handled correctly
 *
 * capture.frame
 */
async function test_capture_frame_circular2() {
  /* capture.frame = save */
  // link to corresponding downloaded frame file
  var options = {
    "capture.frame": "save",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular2/index.html`,
    mode: "source",
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
    url: `${localhost}/capture_frame_circular2/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  var frame = doc.querySelector('iframe');
  assert(frame.getAttribute('src') === `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular2/index.html`);
  assert(!frame.hasAttribute('srcdoc'));

  /* capture.saveAs = singleHtml; srcdoc = false */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "singleHtml",
    "capture.saveDataUriAsSrcdoc": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular2/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  var frame = doc.querySelector('iframe');
  assert(frame.getAttribute('src') === `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular2/index.html`);
  assert(!frame.hasAttribute('srcdoc'));
}

/**
 * Check if frameRename works correctly.
 *
 * capture.frameRename
 */
async function test_capture_frameRename() {
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
}

/**
 * Check if header filename is taken for frameRename
 *
 * capture.frameRename
 */
async function test_capture_frameRename2() {
  /* capture.frameRename = false */
  var options = {
    "capture.frame": "save",
    "capture.frameRename": false,
  };

  var blob = await capture({
    url: `${localhost}/capture_frameRename2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(zip.files["frame1.html"]);
  assert(zip.files["frame2.html"]);
  assert(zip.files["frame3.py.html"]);
  assert(zip.files["a中b#c.php.html"]);

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
    url: `${localhost}/capture_frameRename2/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(zip.files["frame1.html"]);
  assert(zip.files["frame2.html"]);
  assert(zip.files["frame3.py.html"]);
  assert(zip.files["a中b#c.php.html"]);

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
    url: `${localhost}/capture_frameRename2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  var frameSrc = doc.querySelectorAll('iframe')[0].getAttribute('src');
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=frame1\.html,/));

  var frameSrc = doc.querySelectorAll('iframe')[1].getAttribute('src');
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=frame2\.html,/));

  var frameSrc = doc.querySelectorAll('iframe')[2].getAttribute('src');
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=frame3\.py\.html,/));

  var frameSrc = doc.querySelectorAll('iframe')[3].getAttribute('src');
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=a%E4%B8%ADb%23c\.php\.html,/));

  /* capture.saveAs = singleHtml; srcdoc = false; headless */
  var options = {
    "capture.frame": "save",
    "capture.saveAs": "singleHtml",
    "capture.saveDataUriAsSrcdoc": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frameRename2/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  var frameSrc = doc.querySelectorAll('iframe')[0].getAttribute('src');
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=frame1\.html,/));

  var frameSrc = doc.querySelectorAll('iframe')[1].getAttribute('src');
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=frame2\.html,/));

  var frameSrc = doc.querySelectorAll('iframe')[2].getAttribute('src');
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=frame3\.py\.html,/));

  var frameSrc = doc.querySelectorAll('iframe')[3].getAttribute('src');
  assert(frameSrc.match(/^data:text\/html;charset=UTF-8;filename=a%E4%B8%ADb%23c\.php\.html,/));
}

/**
 * Check if option works
 *
 * capture.style
 * capturer.captureDocument
 */
async function test_capture_css_style() {
  /* capture.style = save */
  var options = {
    "capture.style": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_style/style.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["external.css"]);

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
}

/**
 * Check if option works
 *
 * capture.styleInline
 * capturer.captureDocument
 */
async function test_capture_css_styleInline() {
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
  assert(zip.files["green.bmp"]);
  assert(!zip.files["font.woff"]);
  assert(!zip.files["import.css"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('blockquote').getAttribute('style') === `background: yellow;`);

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
  assert(doc.querySelector('blockquote').getAttribute('style') === ``);

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
  assert(!doc.querySelector('blockquote').getAttribute('style'));
}

/**
 * Check if alternative/disabled stylesheets are handled correctly
 *
 * capture.style
 * capturer.captureDocument
 */
async function test_capture_css_disabled() {
  var options = {
    "capture.style": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_disabled/index1.html`,
    options: Object.assign({}, baseOptions, options),
  });
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

  assert(zip.files["persistent.css"]);
  assert(zip.files["default.css"]);
  assert(zip.files["default2.css"]);
  assert(zip.files["alternative.css"]);
  assert(zip.files["alternative2.css"]);

  var blob = await capture({
    url: `${localhost}/capture_css_disabled/index2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  if (userAgent.is('chromium')) {
    // Chromium: browser pick of alternative CSS is not supported
    var styleElems = doc.querySelectorAll('link[rel~="stylesheet"]');
    assert(styleElems[0].matches('[href="persistent.css"]:not([title]):not([rel~="alternate"])'));
    assert(styleElems[1].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
    assert(styleElems[2].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
    assert(styleElems[3].matches('[href="alternative.css"]:not([title])[rel~="alternate"]:not([data-scrapbook-css-disabled])'));
    assert(styleElems[4].matches('[href="alternative2.css"]:not([title])[rel~="alternate"]:not([data-scrapbook-css-disabled])'));
    var styleElem = doc.querySelector('style');
    assert(!styleElem.matches('[data-scrapbook-css-disabled]'));
    assert(styleElem.textContent.trim() === `#internal { background: yellow; }`);

    assert(zip.files["persistent.css"]);
    assert(!zip.files["default.css"]);
    assert(!zip.files["default2.css"]);
    assert(zip.files["alternative.css"]);
    assert(zip.files["alternative2.css"]);
  } else {
    var styleElems = doc.querySelectorAll('link[rel~="stylesheet"]');
    assert(styleElems[0].matches('[href="persistent.css"]:not([title]):not([rel~="alternate"])'));
    assert(styleElems[1].matches('[href="default.css"][title]:not([rel~="alternate"])'));
    assert(styleElems[2].matches('[href="default2.css"][title]:not([rel~="alternate"])'));
    assert(styleElems[3].matches('[href="alternative.css"][title][rel~="alternate"]'));
    assert(styleElems[4].matches('[href="alternative2.css"][title][rel~="alternate"]'));
    var styleElem = doc.querySelector('style');
    assert(!styleElem.matches('[data-scrapbook-css-disabled]'));
    assert(styleElem.textContent.trim() === `#internal { background: yellow; }`);

    assert(zip.files["persistent.css"]);
    assert(zip.files["default.css"]);
    assert(zip.files["default2.css"]);
    assert(zip.files["alternative.css"]);
    assert(zip.files["alternative2.css"]);
  }

  var blob = await capture({
    url: `${localhost}/capture_css_disabled/index3.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  if (userAgent.is('chromium')) {
    // Chromium: browser pick of alternative CSS is not supported
    var styleElems = doc.querySelectorAll('link[rel~="stylesheet"]');
    assert(styleElems[0].matches('[href="persistent.css"]:not([title]):not([rel~="alternate"])'));
    assert(styleElems[1].matches('[href="default.css"]:not([title]):not([rel~="alternate"])'));
    assert(styleElems[2].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
    assert(styleElems[3].matches('[href="alternative.css"]:not([title])[rel~="alternate"]:not([data-scrapbook-css-disabled])'));
    assert(styleElems[4].matches('[href="alternative2.css"]:not([title])[rel~="alternate"]:not([data-scrapbook-css-disabled])'));
    var styleElem = doc.querySelector('style');
    assert(!styleElem.matches('[data-scrapbook-css-disabled]'));
    assert(styleElem.textContent.trim() === `#internal { background: yellow; }`);

    assert(zip.files["persistent.css"]);
    assert(zip.files["default.css"]);
    assert(!zip.files["default2.css"]);
    assert(zip.files["alternative.css"]);
    assert(zip.files["alternative2.css"]);
  } else {
    var styleElems = doc.querySelectorAll('link[rel~="stylesheet"]');
    assert(styleElems[0].matches('[href="persistent.css"]:not([title]):not([rel~="alternate"])'));
    assert(styleElems[1].matches('[href="default.css"]:not([title]):not([rel~="alternate"])'));
    assert(styleElems[2].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
    assert(styleElems[3].matches('[href="alternative.css"]:not([title]):not([rel~="alternate"])'));
    assert(styleElems[4].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
    var styleElem = doc.querySelector('style');
    assert(!styleElem.matches('[data-scrapbook-css-disabled]'));
    assert(styleElem.textContent.trim() === `#internal { background: yellow; }`);

    assert(zip.files["persistent.css"]);
    assert(zip.files["default.css"]);
    assert(!zip.files["default2.css"]);
    assert(zip.files["alternative.css"]);
    assert(!zip.files["alternative2.css"]);
  }

  var blob = await capture({
    url: `${localhost}/capture_css_disabled/index4.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var styleElem = doc.querySelector('link[rel~="stylesheet"]');
  assert(styleElem.matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
  var styleElem = doc.querySelector('style');
  assert(styleElem.matches('[data-scrapbook-css-disabled]'));
  assert(styleElem.textContent.trim() === ``);

  assert(!zip.files["persistent.css"]);
}

/**
 * Check if option works
 *
 * capture.rewriteCss
 * capturer.DocumentCssHandler
 */
async function test_capture_css_rewriteCss() {
  /* capture.rewriteCss = url */
  var options = {
    "capture.rewriteCss": "url",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["imported.css"]);
  assert(zip.files["sansation_light.woff"]);
  assert(zip.files["green.bmp"]);
  assert(zip.files["unsupported-1.bmp"]);
  assert(zip.files["unsupported-2.bmp"]);
  assert(zip.files["unsupported-3.bmp"]);
  assert(zip.files["unsupported-4.bmp"]);

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

  assert(doc.querySelector('blockquote').getAttribute('style') === `background: blue; background: url("green.bmp");`);

  /* capture.rewriteCss = tidy */
  var options = {
    "capture.rewriteCss": "tidy",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["imported.css"]);
  assert(zip.files["sansation_light.woff"]);
  assert(zip.files["green.bmp"]);
  assert(!zip.files["unsupported-1.bmp"]);
  assert(!zip.files["unsupported-2.bmp"]);
  assert(!zip.files["unsupported-3.bmp"]);
  assert(!zip.files["unsupported-4.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  var regex = new RegExp(
    `@import url\\("imported.css"\\);\\s*` +
    `@font-face\\s*{\\s*font-family:\\s*fontface;\\s*src:\\s*url\\("sansation_light.woff"\\);\\s*}\\s*` +
    `#background\\s*{\\s*background:\\s*(?=.*url\\("green.bmp"\\)).*;\\s*}\\s*`
  );
  assert(styleElems[0].textContent.trim().match(regex));
  var regex = new RegExp(
    `@media\\s*print\\s*{\\s*` +
    `#media\\s*{\\s*color:\\s*green;\\s*}\\s*` +
    `}\\s*`
  );
  assert(styleElems[1].textContent.trim().match(regex));
  var regex = new RegExp(
    `@keyframes\\s*demo\\s*{\\s*` +
    `0%\\s*{\\s*transform:\\s*translateX\\(-5px\\);\\s*}\\s*` +
    `100%\\s*{\\s*transform:\\s*translateX\\(40px\\);\\s*}\\s*` +
    `}\\s*` +
    `#keyframes\\s*{\\s*animation:\\s*(?=.*\\b3s\\b)(?=.*\\bdemo\\b)(?=.*\\blinear\\b)(?=.*\\binfinite\\b).*;\\s*}\\s*`
  );
  assert(styleElems[2].textContent.trim().match(regex));
  var regex = new RegExp(
    `@supports\\s*\\(--myvar:\\s*green\\s*\\)\\s*{\\s*` +
    `:root\\s*{\\s*--myvar:\\s*green;\\s*}\\s*` +
    `#supports\\s*{\\s*color:\\s*var\\(--myvar\\);\\s*}\\s*` +
    `}\\s*`
  );
  assert(styleElems[3].textContent.trim().match(regex));
  var regex = new RegExp(
    `@namespace\\s*svg\\s*url\\("http://www.w3.org/2000/svg"\\);\\s*` +
    `svg\\|a\\s*text,\\s*text\\s*svg\\|a\\s*{\\s*fill:\\s*blue;\\s*text-decoration:\\s*underline;\\s*}\\s*`
  );
  assert(styleElems[4].textContent.trim().match(regex));
  var regex = new RegExp(
    `#unsupported\\s*{\\s*}\\s*`
  );
  assert(styleElems[5].textContent.trim().match(regex));

  var regex = new RegExp(
    `background:\\s*(?=.*\\burl\\("green.bmp"\\)).*;\\s*`
  );
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
  assert(zip.files["imported.css"]);
  assert(zip.files["sansation_light.woff"]);
  assert(zip.files["green.bmp"]);
  assert(!zip.files["unsupported-1.bmp"]);
  assert(!zip.files["unsupported-2.bmp"]);
  assert(!zip.files["unsupported-3.bmp"]);
  assert(!zip.files["unsupported-4.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  var regex = new RegExp(
    `@import url\\("imported.css"\\);\\s*` +
    `@font-face\\s*{\\s*font-family:\\s*fontface;\\s*src:\\s*url\\("sansation_light.woff"\\);\\s*}\\s*` +
    `#background\\s*{\\s*background:\\s*(?=.*url\\("green.bmp"\\)).*;\\s*}\\s*`
  );
  assert(styleElems[0].textContent.trim().match(regex));
  var regex = new RegExp(
    `@media\\s*print\\s*{\\s*` +
    `#media\\s*{\\s*color:\\s*green;\\s*}\\s*` +
    `}\\s*`
  );
  assert(styleElems[1].textContent.trim().match(regex));
  var regex = new RegExp(
    `@keyframes\\s*demo\\s*{\\s*` +
    `0%\\s*{\\s*transform:\\s*translateX\\(-5px\\);\\s*}\\s*` +
    `100%\\s*{\\s*transform:\\s*translateX\\(40px\\);\\s*}\\s*` +
    `}\\s*` +
    `#keyframes\\s*{\\s*animation:\\s*(?=.*\\b3s\\b)(?=.*\\bdemo\\b)(?=.*\\blinear\\b)(?=.*\\binfinite\\b).*;\\s*}\\s*`
  );
  assert(styleElems[2].textContent.trim().match(regex));
  var regex = new RegExp(
    `@supports\\s*\\(--myvar:\\s*green\\s*\\)\\s*{\\s*` +
    `:root\\s*{\\s*--myvar:\\s*green;\\s*}\\s*` +
    `#supports\\s*{\\s*color:\\s*var\\(--myvar\\);\\s*}\\s*` +
    `}\\s*`
  );
  assert(styleElems[3].textContent.trim().match(regex));
  var regex = new RegExp(
    `@namespace\\s*svg\\s*url\\("http://www.w3.org/2000/svg"\\);\\s*` +
    `svg\\|a\\s*text,\\s*text\\s*svg\\|a\\s*{\\s*fill:\\s*blue;\\s*text-decoration:\\s*underline;\\s*}\\s*`
  );
  assert(styleElems[4].textContent.trim().match(regex));
  var regex = new RegExp(
    `#unsupported\\s*{\\s*}\\s*`
  );
  assert(styleElems[5].textContent.trim().match(regex));

  var regex = new RegExp(
    `background:\\s*(?=.*\\burl\\("green.bmp"\\)).*;\\s*`
  );
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
@import "ref/imported.css";
@font-face { font-family: fontface; src: url(ref/sansation_light.woff); }
#background { background: url(ref/green.bmp); }`);
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
  *background: url(ref/unsupported-1.bmp); /* IE7 */
  _background: url(ref/unsupported-2.bmp); /* IE6 */
  -o-background: url(ref/unsupported-3.bmp); /* vandor prefix */
  unknown: url(ref/unsupported-4.bmp); /* unknown */
}`);

  assert(doc.querySelector('blockquote').getAttribute('style') === `background: blue; background: url(ref/green.bmp);`);
}

/**
 * Check DOM matching for capture.rewriteCss = "match"
 *
 * capture.rewriteCss
 */
async function test_capture_css_rewriteCss2() {
  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss2/rewrite.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.files["green.bmp"]);
  assert(!zip.files["unsupported-1.bmp"]);
  assert(!zip.files["unsupported-2.bmp"]);
  assert(!zip.files["unsupported-3.bmp"]);
  assert(!zip.files["unsupported-4.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');

  var regex = new RegExp(`^$`);
  assert(styleElems[0].textContent.trim().match(regex));

  var regex = new RegExp(`^$`);
  assert(styleElems[1].textContent.trim().match(regex));

  var regex = new RegExp(
    `@keyframes\\s*demo\\s*{\\s*` +
    `0%\\s*{\\s*transform:\\s*translateX\\(-5px\\);\\s*}\\s*` +
    `100%\\s*{\\s*transform:\\s*translateX\\(40px\\);\\s*}\\s*` +
    `}\\s*`
  );
  assert(styleElems[2].textContent.trim().match(regex));

  var regex = new RegExp(
    `@supports\\s*\\(--myvar:\\s*green\\s*\\)\\s*{\\s*` +
    `:root\\s*{\\s*--myvar:\\s*green;\\s*}\\s*` +
    `}\\s*`
  );
  assert(styleElems[3].textContent.trim().match(regex));

  var regex = new RegExp(
    `^@namespace\\s*svg\\s*url\\("http://www.w3.org/2000/svg"\\);\\s*$`
  );
  assert(styleElems[4].textContent.trim().match(regex));

  assert(styleElems[5].textContent.trim() === ``);

  assert(styleElems[6].textContent.trim() === `:hover { }`);

  assert(styleElems[7].textContent.trim() === `#pseudo1::before { }`);

  assert(styleElems[8].textContent.trim() === `#pseudo2:not([hidden]) { }`);

  assert(styleElems[9].textContent.trim() === `#pseudo3:not(blockquote) { }`);

  assert(styleElems[10].textContent.trim() === `#pseudo4:is(blockquote) { }`);

  assert(styleElems[11].textContent.trim() === ``);

  assert(styleElems[12].textContent.trim() === `:is(#pseudo6):not([hidden]) { }`);

  assert(styleElems[13].textContent.trim() === `:is(#pseudo7):not(blockquote) { }`);

  assert(styleElems[14].textContent.trim() === `[id="pseudo8"]:not([hidden]) { }`);

  assert(styleElems[15].textContent.trim() === `[id="pseudo9"]:not(blockquote) { }`);

  assert(styleElems[16].textContent.trim() === `#pseudo10 :nth-of-type(1) { }`);

  assert(styleElems[17].textContent.trim() === ``);
}

/**
 * Check cross-origin CSS for "tidy" and "match"
 *
 * capture.rewriteCss
 */
async function test_capture_css_rewriteCss3() {
  /* capture.rewriteCss = tidy */
  var options = {
    "capture.rewriteCss": "tidy",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss3/rewrite.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file('linked.css');
  var cssBlob = new Blob([await cssFile.async('blob')], {type: "text/css"});
  var cssText = (await readFileAsText(cssBlob)).trim();
  assert(cssText === `\
@import url("imported.css");
#linked { background-color: green; }
#unused { background-color: red; }`);

  var cssFile = zip.file('imported.css');
  var cssBlob = new Blob([await cssFile.async('blob')], {type: "text/css"});
  var cssText = (await readFileAsText(cssBlob)).trim();
  assert(cssText === `\
#imported { background-color: green; }
#unused { background-color: red; }`);

  /* capture.rewriteCss = match */
  var options = {
    "capture.rewriteCss": "match",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewriteCss3/rewrite.py`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var cssFile = zip.file('linked.css');
  var cssBlob = new Blob([await cssFile.async('blob')], {type: "text/css"});
  var cssText = (await readFileAsText(cssBlob)).trim();
  assert(cssText === `\
@import url("imported.css");
#linked { background-color: green; }`);

  var cssFile = zip.file('imported.css');
  var cssBlob = new Blob([await cssFile.async('blob')], {type: "text/css"});
  var cssText = (await readFileAsText(cssBlob)).trim();
  assert(cssText === `\
#imported { background-color: green; }`);
}

/**
 * Check CSS syntax parsing
 *
 * scrapbook.parseCssText
 */
async function test_capture_css_syntax() {
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
}

/**
 * Check encoding detection for an external or imported CSS
 *
 * scrapbook.parseCssFile
 */
async function test_capture_css_charset() {
  const hasBomUtf8 = async function (blob) {
    var u8ar = new Uint8Array(await readFileAsArrayBuffer(blob));
    return u8ar[0] === 0xEF && u8ar[1] === 0xBB && u8ar[2] === 0xBF;
  };

  var options = {
    "capture.style": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_charset/index.html`,
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

  var file = zip.file('big5.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob, "big5")).trim();
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

/**
 * Check whether linked and imported CSS are all rewritten
 * based to the CSS file (rather than the web page)
 *
 * inline and internal CSS are checked in test_capture_css_rewriteCss
 */
async function test_capture_css_rewrite() {
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
}

/**
 * Check if URL is resolved correctly when base is set to another directory
 */
async function test_capture_css_rewrite2() {
  var options = {
    "capture.imageBackground": "link",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewrite2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('style').textContent.trim() === `#internal { background: url("${localhost}/capture_css_rewrite2/base/green.bmp"); }`);

  var file = zip.file('style.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#link { background: url("${localhost}/capture_css_rewrite2/link/yellow.bmp"); }`);
}

/**
 * Check for "" and hash URL
 * They should be ignored and no file is retrieved
 */
async function test_capture_css_rewrite3() {
  var blob = await capture({
    url: `${localhost}/capture_css_rewrite3/index.html`,
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
}

/**
 * Check for a URL pointing to main page (a bad case)
 * It will be regarded as a CSS file: be fetched, parsed, and saved.
 */
async function test_capture_css_rewrite4() {
  var blob = await capture({
    url: `${localhost}/capture_css_rewrite4/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index-1.html"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `#bad1 { background-image: url("index-1.html"); }`);
}

/**
 * Check if circular CSS referencing is handled correctly
 */
async function test_capture_css_circular() {
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
  assert(text.match(/^@import "(data:text\/css;filename=style2.css,[^"#]*)(?:#[^"]*)?";/));

  // style2.css
  var url = RegExp.$1;
  var text = (await xhr({url, responseType: "text"})).response;
  assert(text.match(/^@import "(data:text\/css;filename=style3.css,[^"#]*)(?:#[^"]*)?";/));

  // style3.css
  var url = RegExp.$1;
  var text = (await xhr({url, responseType: "text"})).response;
  assert(text.trim() === `@import "urn:scrapbook:download:circular:url:${localhost}/capture_css_circular/style1.css";
body { color: blue; }`);
}

/**
 * Check if self-pointing circular CSS referencing is handled correctly
 */
async function test_capture_css_circular2() {
  /* singleHtml */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.style": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_circular2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  // style1.css
  var url = doc.querySelector('link').getAttribute('href');
  var text = (await xhr({url, responseType: "text"})).response;
  assert(text.trim() === `@import "urn:scrapbook:download:circular:url:${localhost}/capture_css_circular2/style1.css";
body { color: red; }`);
}

/**
 * When the origin of a CSS file is different from the source document,
 * the script cannot read its CSS rules directly and a workaround is required.
 * Check if it works: only used bg images and fonts are saved.
 */
async function test_capture_css_cross_origin() {
  var options = {
    "capture.imageBackground": "save-used",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_cross_origin/cross_origin.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['bg1.bmp']);
  assert(zip.files['font1.woff']);
  assert(zip.files['bg2.bmp']);
  assert(zip.files['font2.woff']);

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
}

/**
 * Check if dynamic stylesheets are handled correctly.
 *
 * capturer.DocumentCssHandler
 */
async function test_capture_css_dynamic() {
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
  assert(zip.files['link.css']);
  assert(zip.files['import.css']);
  assert(!zip.files['internal-deleted.bmp']);
  assert(zip.files['internal-inserted.bmp']);
  assert(!zip.files['link-deleted.bmp']);
  assert(zip.files['link-inserted.bmp']);
  assert(!zip.files['import-deleted.bmp']);
  assert(zip.files['import-inserted.bmp']);

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
  assert(zip.files['link.css']);
  assert(zip.files['import.css']);
  assert(!zip.files['internal-deleted.bmp']);
  assert(zip.files['internal-inserted.bmp']);
  assert(!zip.files['link-deleted.bmp']);
  assert(zip.files['link-inserted.bmp']);
  assert(!zip.files['import-deleted.bmp']);
  assert(zip.files['import-inserted.bmp']);

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
}

/**
 * Check if dynamic stylesheets rename are handled correctly.
 *
 * capturer.DocumentCssHandler
 */
async function test_capture_css_dynamic2() {
  var options = {
    "capture.imageBackground": "save",
    "capture.font": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_css_dynamic2/dynamic2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['link.css']);
  assert(zip.files['link-1.css']);
  assert(zip.files['link-2.css']);
  assert(zip.files['link-deleted.bmp']);
  assert(zip.files['link-inserted.bmp']);
  assert(zip.files['import.css']);
  assert(zip.files['import-1.css']);
  assert(zip.files['import-2.css']);
  assert(zip.files['import-deleted.bmp']);
  assert(zip.files['import-inserted.bmp']);

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
    return url.match(/@import "([^"]*)"/)[1].split('#');
  });

  assert(importNames[0][0] === importNames[1][0]);
  assert(importNames[0][0] !== importNames[2][0]);
  assert(importNames[0][0] !== importNames[3][0]);
  assert(importNames[2][0] !== importNames[3][0]);

  assert(importNames[0][1] === undefined);
  assert(importNames[1][1] === '123');
  assert(importNames[2][1] === 'abc');
  assert(importNames[3][1] === 'def');
}

/**
 * Check if adoptedStyleSheets are handled correctly.
 *
 * capturer.DocumentCssHandler
 */
async function test_capture_css_adoptedStyleSheets() {
  // Document.adoptedStyleSheets is supported by Chromium only.
  // Skip for a browser that does not support it.
  if (!document.adoptedStyleSheets) { return; }

  var blob = await capture({
    url: `${localhost}/capture_css_adoptedStyleSheets/index.html`,
    options: baseOptions,
  });
  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[1].textContent.trim() === `#adopted { background-color: rgb(0, 255, 0); }`);
  assert(styleElems[2].textContent.trim() === `#adopted2 { background-color: rgb(0, 255, 0); }`);

  var host1 = doc.querySelector('#shadow1');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  var styleElems = shadow1.querySelectorAll('style');
  assert(styleElems[1].textContent.trim() === `#adopted { background-color: rgb(0, 255, 0); }`);
}

/**
 * Check if option works
 *
 * capture.image
 */
async function test_capture_image() {
  /* capture.image = save */
  var options = {
    "capture.image": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/image.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['red.bmp']);
  assert(zip.files['green.bmp']);
  assert(zip.files['blue.bmp']);
  assert(zip.files['yellow.bmp']);

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
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['red.bmp']);
  assert(zip.files['green.bmp']);
  assert(zip.files['blue.bmp']);
  assert(zip.files['yellow.bmp']);

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
}

/**
 * Check if option works
 *
 * capture.imageBackground
 */
async function test_capture_imageBackground() {
  /* capture.imageBackground = save */
  var options = {
    "capture.imageBackground": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['link.css']);
  assert(zip.files['import.css']);
  assert(zip.files['red.bmp']);
  assert(zip.files['green.bmp']);
  assert(zip.files['blue.bmp']);
  assert(zip.files['yellow.bmp']);

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
  assert(zip.files['link.css']);
  assert(zip.files['import.css']);
  assert(zip.files['red.bmp']);
  assert(zip.files['green.bmp']);
  assert(zip.files['blue.bmp']);
  assert(zip.files['yellow.bmp']);

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
}

/**
 * Check if used background images in the CSS are mapped correctly
 *
 * capture.imageBackground
 */
async function test_capture_imageBackground_used() {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.imageBackground": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['link.css']);
  assert(zip.files['import.css']);
  assert(zip.files['inline.bmp']);
  assert(zip.files['internal.bmp']);
  assert(zip.files['link.bmp']);
  assert(zip.files['import.bmp']);
  assert(zip.files['pseudo1.bmp']);
  assert(zip.files['pseudo2.bmp']);
  assert(zip.files['pseudo3.bmp']);
  assert(zip.files['pseudo4.bmp']);
  assert(zip.files['link-keyframes.css']);
  assert(zip.files['import-keyframes.css']);
  assert(zip.files['internal-keyframes.bmp']);
  assert(zip.files['link-keyframes.bmp']);
  assert(zip.files['import-keyframes.bmp']);
  assert(!zip.files['neverused.bmp']);
  assert(!zip.files['removed.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `#internal { background-image: url("internal.bmp"); }`);
  assert(styleElems[2].textContent.trim() === `\
#pseudo1::before { background-image: url("pseudo1.bmp"); content: "X"; }
#pseudo2::after { background-image: url("pseudo2.bmp"); content: "X"; }
#pseudo3::first-letter { background-image: url("pseudo3.bmp"); }
#pseudo4::first-line { background-image: url("pseudo4.bmp"); }`);
  assert(styleElems[3].textContent.trim() === `\
@keyframes internal {
  from { background-image: url("internal-keyframes.bmp"); }
  to { transform: translateX(40px); }
}`);
  assert(styleElems[5].textContent.trim() === `#neverused { background-image: url(""); }`);
  assert(styleElems[6].textContent.trim() === `\
@keyframes neverused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);
  assert(styleElems[7].textContent.trim() === `#removed-internal { background-image: url(""); }`);
  assert(styleElems[8].textContent.trim() === `\
@keyframes removed {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link { background-image: url("link.bmp"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#import { background-image: url("import.bmp"); }`);

  var cssFile = zip.file('link-keyframes.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `\
@keyframes link {
  from { background-image: url("link-keyframes.bmp"); }
  to { transform: translateX(40px); }
}`);

  var cssFile = zip.file('import-keyframes.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `\
@keyframes import {
  from { background-image: url("import-keyframes.bmp"); }
  to { transform: translateX(40px); }
}`);

  /* capture.imageBackground = save-used (headless) */
  // the result is same as save
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.imageBackground": "save-used",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_imageBackground_used/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['link.css']);
  assert(zip.files['import.css']);
  assert(zip.files['inline.bmp']);
  assert(zip.files['internal.bmp']);
  assert(zip.files['link.bmp']);
  assert(zip.files['import.bmp']);
  assert(zip.files['pseudo1.bmp']);
  assert(zip.files['pseudo2.bmp']);
  assert(zip.files['pseudo3.bmp']);
  assert(zip.files['pseudo4.bmp']);
  assert(zip.files['link-keyframes.css']);
  assert(zip.files['import-keyframes.css']);
  assert(zip.files['internal-keyframes.bmp']);
  assert(zip.files['link-keyframes.bmp']);
  assert(zip.files['import-keyframes.bmp']);
  assert(zip.files['neverused.bmp']);
  assert(zip.files['removed.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `#internal { background-image: url("internal.bmp"); }`);
  assert(styleElems[2].textContent.trim() === `\
#pseudo1::before { background-image: url("pseudo1.bmp"); content: "X"; }
#pseudo2::after { background-image: url("pseudo2.bmp"); content: "X"; }
#pseudo3::first-letter { background-image: url("pseudo3.bmp"); }
#pseudo4::first-line { background-image: url("pseudo4.bmp"); }`);
  assert(styleElems[3].textContent.trim() === `\
@keyframes internal {
  from { background-image: url("internal-keyframes.bmp"); }
  to { transform: translateX(40px); }
}`);
  assert(styleElems[5].textContent.trim() === `#neverused { background-image: url("neverused.bmp"); }`);
  assert(styleElems[6].textContent.trim() === `\
@keyframes neverused {
  from { background-image: url("neverused.bmp"); }
  to { transform: translateX(40px); }
}`);
  assert(styleElems[7].textContent.trim() === `#removed-internal { background-image: url("removed.bmp"); }`);
  assert(styleElems[8].textContent.trim() === `\
@keyframes removed {
  from { background-image: url("removed.bmp"); }
  to { transform: translateX(40px); }
}`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link { background-image: url("link.bmp"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#import { background-image: url("import.bmp"); }`);

  var cssFile = zip.file('link-keyframes.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `\
@keyframes link {
  from { background-image: url("link-keyframes.bmp"); }
  to { transform: translateX(40px); }
}`);

  var cssFile = zip.file('import-keyframes.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `\
@keyframes import {
  from { background-image: url("import-keyframes.bmp"); }
  to { transform: translateX(40px); }
}`);
}

/**
 * Check syntax for used background images
 *
 * capture.imageBackground
 */
async function test_capture_imageBackground_used2() {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['keyframes-1.bmp']);
  assert(zip.files['keyframes-complex-1.bmp']);
  assert(zip.files['keyframes-multi-1.bmp']);
  assert(zip.files['keyframes-multi-2.bmp']);
  assert(zip.files['keyframes-multi-3.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[1].textContent.trim() === `\
@keyframes keyframes1 {
  from { background-image: url("keyframes-1.bmp"); }
  to { transform: translateX(40px); }
}`);
  assert(styleElems[2].textContent.trim() === `\
@keyframes keyframes\\Awith\\ complex\\\\syntax {
  from { background-image: url("keyframes-complex-1.bmp"); }
  to { transform: translateX(40px); }
}`);
  assert(styleElems[3].textContent.trim() === `\
@keyframes multi\\ 1 {
  from { background-image: url("keyframes-multi-1.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes multi\\"2\\" {
  33% { background-image: url("keyframes-multi-2.bmp"); }
  66% { background-image: url("keyframes-multi-3.bmp"); }
}`);
}

/**
 * Check if used background images in a shadow DOM are considered
 *
 * capture.imageBackground
 */
async function test_capture_imageBackground_used3() {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
    "capture.shadowDom": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used3/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['green.bmp']);
  assert(zip.files['yellow.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host1 = doc.querySelector('#shadow1');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('style').textContent.trim() === `\
:host { background-image: url("yellow.bmp"); }
#shadow { background-image: url("green.bmp"); }`);
}

/**
 * Check if used background images in scoped @keyframe are handled correctly
 *
 * capture.imageBackground
 */
async function test_capture_imageBackground_used4() {
  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
    "capture.shadowDom": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used4/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.files['internal-keyframes1.bmp']);
  assert(!zip.files['internal-keyframes2.bmp']);
  assert(zip.files['shadow-keyframes1.bmp']);
  assert(zip.files['shadow-keyframes2.bmp']);
  assert(zip.files['shadow-keyframes3.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `\
@keyframes internal1 {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}

@keyframes internal2 {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);

  var host1 = doc.querySelector('#shadow1');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('style').textContent.trim() === `\
@keyframes shadow1 {
  from { background-image: url("shadow-keyframes1.bmp"); }
  to { transform: translateX(40px); }
}
#shadow-keyframes1 {
  animation: shadow1 3s linear infinite;
}

@keyframes internal1 {
  from { background-image: url("shadow-keyframes2.bmp"); }
  to { transform: translateX(40px); }
}
#shadow-keyframes2 {
  animation: internal1 3s linear infinite;
}

#shadow-keyframes3 {
  animation: internal2 3s linear infinite;
}
@keyframes internal2 {
  from { background-image: url("shadow-keyframes3.bmp"); }
  to { transform: translateX(40px); }
}`);
}

/**
 * Check if used background images in adoptedStyleSheets are handled correctly
 *
 * capture.imageBackground
 */
async function test_capture_imageBackground_used5() {
  // Document.adoptedStyleSheets is supported by Chromium only.
  // Skip for a browser that does not support it.
  if (!document.adoptedStyleSheets) { return; }

  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
    "capture.rewriteCss": "url",
    "capture.shadowDom": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_imageBackground_used5/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['doc.bmp']);
  assert(zip.files['shadow.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `#adopted { background-image: url("doc.bmp"); }`);

  var host1 = doc.querySelector('#shadow1');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('style').textContent.trim() === `#adopted { background-image: url("shadow.bmp"); }`);
}

/**
 * Check if option works
 *
 * capture.favicon
 */
async function test_capture_image_favicon() {
  /* capture.favicon = save */
  var options = {
    "capture.favicon": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_image_favicon/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['red.bmp']);

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
    url: `${localhost}/capture_image_favicon/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElem = doc.querySelector('link[rel~="icon"]');
  assert(iconElem.getAttribute('href') === `${localhost}/capture_image_favicon/red.bmp`);

  /* capture.favicon = blank */
  var options = {
    "capture.favicon": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_image_favicon/favicon.html`,
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
    url: `${localhost}/capture_image_favicon/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElem = doc.querySelector('link[rel~="icon"]');
  assert(!iconElem);
}

/**
 * Check if option works
 *
 * capture.canvas
 */
async function test_capture_canvas() {
  /* capture.canvas = save */
  var options = {
    "capture.canvas": "save",
    "capture.script": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_canvas/canvas.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(/^\(function \(\) \{.+\}\)\(\)$/));

  assert(!doc.querySelector('#c1').hasAttribute("data-scrapbook-canvas"));
  assert(doc.querySelector('#c2').getAttribute("data-scrapbook-canvas").match(/^data:image\/png;base64,/));

  // canvas in the shadow DOM
  var blob = await capture({
    url: `${localhost}/capture_canvas/canvas2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(/^\(function \(\) \{.+\}\)\(\)$/));
  
  var host = doc.querySelector('span');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(shadow.querySelector('canvas').getAttribute('data-scrapbook-canvas').match(/^data:image\/png;base64,/));

  /* capture.canvas = blank */
  var options = {
    "capture.canvas": "blank",
    "capture.script": "remove",
  };
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
    url: `${localhost}/capture_canvas/canvas2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(/^\(function \(\) \{.+\}\)\(\)$/));

  var host = doc.querySelector('span');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(!shadow.querySelector('canvas').hasAttribute('data-scrapbook-canvas'));

  /* capture.canvas = remove */
  var options = {
    "capture.canvas": "remove",
    "capture.script": "remove",
  };
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
    url: `${localhost}/capture_canvas/canvas2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(/^\(function \(\) \{.+\}\)\(\)$/));

  var host = doc.querySelector('span');
  var frag = doc.createElement("template");
  frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
  var shadow = frag.content;
  assert(!shadow.querySelector('canvas'));
}

/**
 * Check if option works
 *
 * capture.audio
 */
async function test_capture_audio() {
  // Use headless for most test cases since loading audio in the browser is slow.

  /* capture.audio = save (headless) */
  var options = {
    "capture.audio": "save",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_audio/audio.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['horse.ogg']);
  assert(zip.files['horse.mp3']);
  assert(zip.files['horse_en.vtt']);
  assert(zip.files['horse_zh.vtt']);

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
  assert(zip.files['horse_en.vtt']);
  assert(zip.files['horse_zh.vtt']);

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
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['horse.ogg']);
  assert(zip.files['horse.mp3']);
  assert(zip.files['horse_en.vtt']);
  assert(zip.files['horse_zh.vtt']);

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
    mode: "source",
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
    mode: "source",
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
    mode: "source",
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
}

/**
 * Check if option works
 *
 * capture.video
 */
async function test_capture_video() {
  // Use headless for most test cases since loading video in the browser is slow.

  /* capture.video = save (headless) */
  var options = {
    "capture.video": "save",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_video/video.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['small.mp4']);
  assert(zip.files['small.webm']);
  assert(zip.files['small_en.vtt']);
  assert(zip.files['small_zh.vtt']);

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
  assert(zip.files['small_en.vtt']);
  assert(zip.files['small_zh.vtt']);

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
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['small.mp4']);
  assert(zip.files['small.webm']);
  assert(zip.files['small_en.vtt']);
  assert(zip.files['small_zh.vtt']);

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
    mode: "source",
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
    mode: "source",
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
    mode: "source",
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
}

/**
 * Check if option works
 *
 * capture.font
 */
async function test_capture_font() {
  /* capture.font = save */
  var options = {
    "capture.font": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_font/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['sansation_light.woff']);

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
  assert(zip.files['sansation_light.woff']);

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
}

/**
 * Check if used fonts in the CSS are mapped correctly
 *
 * capture.font = "save-used"
 */
async function test_capture_font_used() {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.video": "remove",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['internal.woff']);
  assert(zip.files['link.woff']);
  assert(zip.files['import.woff']);
  assert(zip.files['pseudo1.woff']);
  assert(zip.files['internal-ranged1.woff']);
  assert(zip.files['internal-ranged2.woff']);
  assert(zip.files['internal-keyframes.woff']);
  assert(!zip.files['neverused.woff']);
  assert(!zip.files['removed.woff']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: internal; src: url("internal.woff"); }`);
  assert(styleElems[2].textContent.trim() === `\
@font-face { font-family: pseudo1; src: url("pseudo1.woff"); }
#pseudo1::before { font-family: pseudo1; content: "X"; }`);
  assert(styleElems[3].textContent.trim() === `\
@font-face { font-family: internal-ranged; unicode-range: U+0-7F; src: url("internal-ranged1.woff"); }
@font-face { font-family: internal-ranged; unicode-range: U+8?, U+9?, U+1??; src: url("internal-ranged2.woff"); }`);
  assert(styleElems[4].textContent.trim() === `\
@font-face { font-family: internal-keyframes; src: url("internal-keyframes.woff"); }`);
  assert(styleElems[6].textContent.trim() === `@font-face { font-family: neverused; src: url(""); }`);
  assert(styleElems[9].textContent.trim() === `@font-face { font-family: removed-internal; src: url(""); }`);
  assert(styleElems[10].textContent.trim() === `@font-face { font-family: removed-keyframes; src: url(""); }`);

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
    url: `${localhost}/capture_font_used/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['internal.woff']);
  assert(zip.files['link.woff']);
  assert(zip.files['import.woff']);
  assert(zip.files['pseudo1.woff']);
  assert(zip.files['internal-ranged1.woff']);
  assert(zip.files['internal-ranged2.woff']);
  assert(zip.files['internal-keyframes.woff']);
  assert(zip.files['neverused.woff']);
  assert(zip.files['removed.woff']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: internal; src: url("internal.woff"); }`);
  assert(styleElems[2].textContent.trim() === `\
@font-face { font-family: pseudo1; src: url("pseudo1.woff"); }
#pseudo1::before { font-family: pseudo1; content: "X"; }`);
  assert(styleElems[3].textContent.trim() === `\
@font-face { font-family: internal-ranged; unicode-range: U+0-7F; src: url("internal-ranged1.woff"); }
@font-face { font-family: internal-ranged; unicode-range: U+8?, U+9?, U+1??; src: url("internal-ranged2.woff"); }`);
  assert(styleElems[4].textContent.trim() === `\
@font-face { font-family: internal-keyframes; src: url("internal-keyframes.woff"); }`);
  assert(styleElems[6].textContent.trim() === `@font-face { font-family: neverused; src: url("neverused.woff"); }`);
  assert(styleElems[9].textContent.trim() === `@font-face { font-family: removed-internal; src: url("removed.woff"); }`);
  assert(styleElems[10].textContent.trim() === `@font-face { font-family: removed-keyframes; src: url("removed.woff"); }`);

  var cssFile = zip.file('link.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `@font-face { font-family: link; src: url("link.woff"); }`);

  var cssFile = zip.file('import.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `@font-face { font-family: import; src: url("import.woff"); }`);
}

/**
 * Check syntax for used fonts
 *
 * capture.font = "save-used"
 */
async function test_capture_font_used2() {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['identifier-1.woff']);
  assert(zip.files['identifier-2.woff']);
  assert(zip.files['string-1.woff']);
  assert(zip.files['string-2.woff']);
  assert(zip.files['string-3.woff']);
  assert(zip.files['string-4.woff']);
  assert(zip.files['complex-name-1.woff']);
  assert(zip.files['complex-name-2.woff']);
  assert(zip.files['multiple-value-1.woff']);
  assert(zip.files['multiple-value-2.woff']);
  assert(zip.files['keyframes-1.woff']);
  assert(zip.files['keyframes-2.woff']);
  assert(zip.files['keyframes-3.woff']);

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
}

/**
 * Check if used fonts in scoped @font-face are handled correctly
 *
 * capture.font
 */
async function test_capture_font_used3() {
  /* capture.font = save-used */
  var options = {
    "capture.rewriteCss": "url",
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font_used3/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(!zip.files['internal1.woff']);
  assert(!zip.files['internal2.woff']);
  assert(zip.files['shadow1.woff']);
  assert(zip.files['shadow2.woff']);
  assert(zip.files['shadow3.woff']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `\
@font-face { font-family: internal1; src: url(""); }
@font-face { font-family: internal2; src: url(""); }`);

  var host1 = doc.querySelector('#shadow1');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('style').textContent.trim() === `\
@font-face { font-family: shadow1; src: url("shadow1.woff"); }
#shadow1 { font-family: shadow1; }

@font-face { font-family: internal1; src: url("shadow2.woff"); }
#shadow2 { font-family: internal1; }

#shadow3 { font-family: internal2; }
@font-face { font-family: internal2; src: url("shadow3.woff"); }`);
}

/**
 * Check if option works
 *
 * capture.script
 */
async function test_capture_script() {
  /* capture.script = save */
  var options = {
    "capture.script": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_script/script.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['script1.js']);
  assert(zip.files['script2.js']);

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
  var a = doc.querySelector('a');
  assert(a.getAttribute('href').trim() === `javascript:console.log('a');`);
  var body = doc.body;
  assert(body.getAttribute('onload').trim() === `console.log('load');`);
  assert(body.getAttribute('oncontextmenu').trim() === `return false;`);
  var div = doc.querySelector('div');
  assert(div.getAttribute('onclick').trim() === `console.log('click');`);

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
  var a = doc.querySelector('a');
  assert(a.getAttribute('href').trim() === `javascript:console.log('a');`);
  var body = doc.body;
  assert(body.getAttribute('onload').trim() === `console.log('load');`);
  assert(body.getAttribute('oncontextmenu').trim() === `return false;`);
  var div = doc.querySelector('div');
  assert(div.getAttribute('onclick').trim() === `console.log('click');`);

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
  var a = doc.querySelector('a');
  assert(a.getAttribute('href').trim() === `javascript:`);
  var body = doc.body;
  assert(!body.hasAttribute('onload'));
  assert(!body.hasAttribute('oncontextmenu'));
  var div = doc.querySelector('div');
  assert(!div.hasAttribute('onclick'));

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
  var a = doc.querySelector('a');
  assert(a.getAttribute('href').trim() === `javascript:`);
  var body = doc.body;
  assert(!body.hasAttribute('onload'));
  assert(!body.hasAttribute('oncontextmenu'));
  var div = doc.querySelector('div');
  assert(!div.hasAttribute('onclick'));
}

/**
 * Check if option works
 *
 * capture.noscript
 */
async function test_capture_noscript() {
  /* capture.noscript = save */
  var options = {
    "capture.noscript": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_script/noscript.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['red.bmp']);

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
}

/**
 * Check if option works
 *
 * capture.embed
 */
async function test_capture_embed() {
  /* capture.embed = save */
  var options = {
    "capture.embed": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['helloworld.swf']);

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
    url: `${localhost}/capture_object/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var embed = doc.querySelector('embed');
  assert(embed.getAttribute('src') === `${localhost}/capture_object/helloworld.swf`);

  /* capture.embed = blank */
  var options = {
    "capture.embed": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/embed.html`,
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
    url: `${localhost}/capture_object/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var embed = doc.querySelector('embed');
  assert(!embed);
}

/**
 * Check if option works
 *
 * capture.object
 */
async function test_capture_object() {
  var options = {
    "capture.frameRename": false,
  };

  /* capture.object = save */
  options["capture.object"] = "save";
  var blob = await capture({
    url: `${localhost}/capture_object/object.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['demo.svg']);
  assert(zip.files['green.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var objects = doc.querySelectorAll('object');
  assert(objects[0].getAttribute('data') === `demo.svg`);
  assert(objects[1].getAttribute('data') === `green.bmp`);

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
}

/**
 * Headlessly capture object content like a frame.
 *
 * capture.object
 */
async function test_capture_object2() {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.object": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_object2/cross-origin.py`,
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
  assert(frameDoc.querySelector('a').getAttribute("href").trim() === `${localhost2}/capture_frame/same-origin.html`);

  // text.txt
  var frame = frames[3];
  assert(frame.getAttribute('data') === 'text.txt');
  var frameFile = zip.file(frame.getAttribute('data'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
}

/**
 * Check if circular object referencing is handled correctly like a frame.
 *
 * capture.object
 */
async function test_capture_object_circular() {
  /* capture.saveAs = zip */
  // link to corresponding downloaded frame file
  var options = {
    "capture.object": "save",
    "capture.saveAs": "zip",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_object_circular/index.html`,
    mode: "source",
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
    mode: "source",
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
}

/**
 * Check if option works
 *
 * capture.applet
 */
async function test_capture_applet() {
  /* capture.applet = save */
  var options = {
    "capture.applet": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/applet.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['applet.class']);
  assert(zip.files['applet.jar']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var applet = doc.querySelector('applet');
  assert(applet.getAttribute('code') === `applet.class`);
  assert(applet.getAttribute('archive') === `applet.jar`);

  /* capture.applet = link */
  var options = {
    "capture.applet": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/applet.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var applet = doc.querySelector('applet');
  assert(applet.getAttribute('code') === `${localhost}/capture_object/applet.class`);
  assert(applet.getAttribute('archive') === `${localhost}/capture_object/applet.jar`);

  /* capture.applet = blank */
  var options = {
    "capture.applet": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/applet.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var applet = doc.querySelector('applet');
  assert(!applet.hasAttribute('code'));
  assert(!applet.hasAttribute('archive'));

  /* capture.applet = remove */
  var options = {
    "capture.applet": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/applet.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var applet = doc.querySelector('applet');
  assert(!applet);
  assert(!applet);
}

/**
 * Check if option works
 *
 * capture.preload
 */
async function test_capture_preload() {
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
}

/**
 * Check if option works
 *
 * capture.prefetch
 */
async function test_capture_prefetch() {
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
}

/**
 * Check if option works
 *
 * capture.base
 */
async function test_capture_base() {
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
}

/**
 * Check if option works
 *
 * capture.formStatus
 */
async function test_capture_formStatus() {
  /* capture.formStatus = save-all */
  var options = {
    "capture.formStatus": "save-all",
  };
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

  /* capture.formStatus = save */
  var options = {
    "capture.formStatus": "save",
  };
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

  /* capture.formStatus = keep-all */
  var options = {
    "capture.formStatus": "keep-all",
  };
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

  /* capture.formStatus = keep */
  var options = {
    "capture.formStatus": "keep",
  };
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

  /* capture.formStatus = html-all */
  var options = {
    "capture.formStatus": "html-all",
  };
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

  /* capture.formStatus = html */
  var options = {
    "capture.formStatus": "html",
  };
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

  /* capture.formStatus = reset */
  var options = {
    "capture.formStatus": "reset",
  };
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
}

/**
 * Check if shadow DOMs (possibly nested) can be captured correctly.
 *
 * capturer.captureDocument
 */
async function test_capture_shadowRoot() {
  /* capture.shadowDom = save */
  var options = {
    "capture.shadowDom": "save",
    "capture.image": "save",
    "capture.script": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(zip.files["green.bmp"]);
  assert(zip.files["blue.bmp"]);

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
  assert(loader.textContent.trim().match(/^\(function \(\) \{.+\}\)\(\)$/));

  /* capture.shadowDom = remove */
  var options = {
    "capture.shadowDom": "remove",
    "capture.image": "save",
    "capture.script": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(!zip.files["green.bmp"]);
  assert(!zip.files["blue.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('[data-scrapbook-shadowroot]'));
  assert(!doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));
}

/**
 * Check for shadow DOM auto-generated via custom elements.
 *
 * capturer.captureDocument
 */
async function test_capture_shadowRoot2() {
  var options = {
    "capture.shadowDom": "save",
    "capture.image": "save",
    "capture.script": "remove",
  };

  /* mode: open */
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(zip.files["green.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var host1 = doc.querySelector('custom-elem');
  var frag = doc.createElement("template");
  frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
  var shadow1 = frag.content;
  assert(shadow1.querySelector('img').getAttribute('src') === `green.bmp`);

  var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
  assert(loader.textContent.trim().match(/^\(function \(\) \{.+\}\)\(\)$/));

  /* mode: closed */
  var blob = await capture({
    url: `${localhost}/capture_shadowRoot2/index2.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(!zip.files["green.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('[data-scrapbook-shadowroot]'));
  assert(!doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));
}

/**
 * Check if removeHidden works correctly.
 *
 * capturer.removeHidden
 */
async function test_capture_removeHidden() {
  /* capture.removeHidden = undisplayed */
  var options = {
    "capture.removeHidden": "undisplayed",
  };

  var blob = await capture({
    url: `${localhost}/capture_removeHidden/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(!zip.files["red.bmp"]);

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
  assert(zip.files["index.html"]);
  assert(zip.files["red.bmp"]);

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
}

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
async function test_capture_rewrite() {
  var blob = await capture({
    url: `${localhost}/capture_rewrite/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["green.bmp"]);
  assert(zip.files["yellow.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('img').getAttribute('src') === `green.bmp`);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `green.bmp 1x, yellow.bmp 2x`);
}

/**
 * Check for "", hash, search,
 * and URL pointing to main html page (a bad case)
 *
 * capturer.resolveRelativeUrl
 * capturer.captureDocument
 */
async function test_capture_rewrite2() {
  var options = {
    "capture.saveResourcesSequentially": true,
  };

  var blob = await capture({
    url: `${localhost}/capture_rewrite2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index-1.html"]);
  assert(zip.files["index-2.html"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === ``);
  assert(imgs[1].getAttribute('src') === `#123`);
  assert(imgs[2].getAttribute('src') === `index-1.html`); // html page saved as img
  assert(imgs[3].getAttribute('src') === `index-2.html`); // html page saved as img
}

/**
 * Check if redirection is handled correctly.
 *
 * - Filename should based on the redirected URL.
 *
 * - Hash should be the source hash.
 *
 * capturer.captureDocument
 */
async function test_capture_redirect() {
  var options = {
    "capture.frameRename": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_redirect/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link').getAttribute('href') === `style.css#abc`);
  assert(doc.querySelector('img').getAttribute('src') === `green.bmp#abc`);
  assert(doc.querySelector('iframe').getAttribute('src') === `frame.html#abc`);
}

/**
 * Hash in the "Location" header should be ignored.
 *
 * @TODO: Browser usually use the "Location" header hash if it exists and use
 * the source URL hash if not. As the response URL of XMLHttpRequest and
 * fetch API doesn't contain hash, we use the source URL hash any currently.
 */
async function test_capture_redirect2() {
  var options = {
    "capture.frameRename": false,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_redirect2/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('link').getAttribute('href') === `style.css#abc`);
  assert(doc.querySelector('img').getAttribute('src') === `green.bmp#abc`);
  assert(doc.querySelector('iframe').getAttribute('src') === `frame.html#abc`);
}

/**
 * Check if the URL in an anchor (link) is rewritten correctly
 *
 * capturer.captureDocument
 */
async function test_capture_anchor() {
  var blob = await capture({
    url: `${localhost}/capture_anchor/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === ``);
  assert(anchors[1].getAttribute('href') === `#`);
  assert(anchors[2].getAttribute('href') === `#123`);
  assert(anchors[3].getAttribute('href') === `${localhost}/capture_anchor/index.html?id=123`);
  assert(anchors[4].getAttribute('href') === ``);
  assert(anchors[5].getAttribute('href') === `#`);
  assert(anchors[6].getAttribute('href') === `#123`);
  assert(anchors[7].getAttribute('href') === `${localhost}/capture_anchor/index.html?id=123`);
  assert(anchors[8].getAttribute('href') === `${localhost}/capture_anchor/linked.html`);
  assert(anchors[9].getAttribute('href') === `${localhost}/capture_anchor/linked.html#`);
  assert(anchors[10].getAttribute('href') === `${localhost}/capture_anchor/linked.html#123`);
  assert(anchors[11].getAttribute('href') === `${localhost}/capture_anchor/linked.html?id=123`);
  assert(anchors[12].getAttribute('href') === `${localhost}/capture_anchor/subdir/linked.html`);
  assert(anchors[13].getAttribute('href') === `${localhost}/capture_anchor/subdir/linked.html#`);
  assert(anchors[14].getAttribute('href') === `${localhost}/capture_anchor/subdir/linked.html#123`);
  assert(anchors[15].getAttribute('href') === `${localhost}/capture_anchor/subdir/linked.html?id=123`);
  assert(anchors[16].getAttribute('href') === `http://example.com/`); // slight changed from http://example.com
  assert(anchors[17].getAttribute('href') === `http://example.com/#`);
  assert(anchors[18].getAttribute('href') === `http://example.com/#123`);
  assert(anchors[19].getAttribute('href') === `http://example.com/?id=123`);
}

/**
 * Check local selection
 * a hash URL pointing to a not captured part of self page should be resolved to original page
 *
 * capturer.captureDocument
 */
async function test_capture_anchor2() {
  /* hash link target not captured */
  var blob = await capture({
    url: `${localhost}/capture_anchor/index21.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === ``);
  assert(anchors[1].getAttribute('href') === `#`);
  assert(anchors[2].getAttribute('href') === `${localhost}/capture_anchor/index21.html#target_id`);
  assert(anchors[3].getAttribute('href') === `${localhost}/capture_anchor/index21.html#target_name`);
  assert(anchors[4].getAttribute('href') === ``);
  assert(anchors[5].getAttribute('href') === `#`);
  assert(anchors[6].getAttribute('href') === `${localhost}/capture_anchor/index21.html#target_id`);
  assert(anchors[7].getAttribute('href') === `${localhost}/capture_anchor/index21.html#target_name`);

  /* hash link target captured */
  var blob = await capture({
    url: `${localhost}/capture_anchor/index22.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === ``);
  assert(anchors[1].getAttribute('href') === `#`);
  assert(anchors[2].getAttribute('href') === `#target_id`);
  assert(anchors[3].getAttribute('href') === `#target_name`);
  assert(anchors[4].getAttribute('href') === ``);
  assert(anchors[5].getAttribute('href') === `#`);
  assert(anchors[6].getAttribute('href') === `#target_id`);
  assert(anchors[7].getAttribute('href') === `#target_name`);
}

/**
 * Check when base is set to another page
 *
 * capturer.captureDocument
 */
async function test_capture_anchor3() {
  var blob = await capture({
    url: `${localhost}/capture_anchor/index3.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `${localhost}/capture_anchor/subdir/linked.html`);
  assert(anchors[1].getAttribute('href') === `${localhost}/capture_anchor/subdir/linked.html#`);
  assert(anchors[2].getAttribute('href') === `${localhost}/capture_anchor/subdir/linked.html#123`);
  assert(anchors[3].getAttribute('href') === `${localhost}/capture_anchor/subdir/linked.html?id=123`);
  assert(anchors[4].getAttribute('href') === ``);
  assert(anchors[5].getAttribute('href') === `#`);
  assert(anchors[6].getAttribute('href') === `#123`);
  assert(anchors[7].getAttribute('href') === `${localhost}/capture_anchor/index3.html?id=123`);
  assert(anchors[8].getAttribute('href') === `http://example.com/`); // slight changed from http://example.com
}

/**
 * Check if option works
 *
 * capture.downLink.file.mode
 * capture.downLink.file.extFilter
 */
async function test_capture_downLink01() {
  /* header */
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `txt, bmp, css, html`,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file2.txt"]);
  assert(zip.files["file3.txt"]);
  assert(zip.files["file4.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(zip.files["page.html"]);
  assert(Object.keys(zip.files).length === 8);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `file.txt`);
  assert(anchors[1].getAttribute('href') === `file.css#123`);
  assert(anchors[2].getAttribute('href') === `file.bmp`);
  assert(anchors[3].getAttribute('href') === `page.html`);
  assert(anchors[4].getAttribute('href') === `file2.txt`);
  assert(anchors[5].getAttribute('href') === `file3.txt`);
  assert(anchors[6].getAttribute('href') === `file4.txt`);

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
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(!zip.files["file2.txt"]);
  assert(!zip.files["file3.txt"]);
  assert(!zip.files["file4.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(zip.files["page.html"]);
  assert(Object.keys(zip.files).length === 5);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `file.txt`);
  assert(anchors[1].getAttribute('href') === `file.css#123`);
  assert(anchors[2].getAttribute('href') === `file.bmp`);
  assert(anchors[3].getAttribute('href') === `page.html`);
  assert(anchors[4].getAttribute('href') === `${localhost}/capture_downLink/filename.py`);
  assert(anchors[5].getAttribute('href') === `${localhost}/capture_downLink/mime.py`);
  assert(anchors[6].getAttribute('href') === `${localhost}/capture_downLink/redirect.pyr`);

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
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `${localhost}/capture_downLink/file.txt`);
  assert(anchors[1].getAttribute('href') === `${localhost}/capture_downLink/file.css#123`);
  assert(anchors[2].getAttribute('href') === `${localhost}/capture_downLink/file.bmp`);
  assert(anchors[3].getAttribute('href') === `${localhost}/capture_downLink/page.html`);
  assert(anchors[4].getAttribute('href') === `${localhost}/capture_downLink/filename.py`);
  assert(anchors[5].getAttribute('href') === `${localhost}/capture_downLink/mime.py`);
  assert(anchors[6].getAttribute('href') === `${localhost}/capture_downLink/redirect.pyr`);
}

/**
 * Check extFilter syntax
 *
 * capture.downLink.file.extFilter
 */
async function test_capture_downLink02() {
  // a rule each line
  // match URL (*.py) but download using resolved filename using header (*.txt)
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt\nbmp\ncss\npy`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file2.txt"]);
  assert(zip.files["file3.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 6);

  // space separator
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt bmp css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // comma separator
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt,bmp,css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // semicolon separator
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt;bmp;css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // combined separator
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `txt; bmp ,; css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // match full extension
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `tx, mp, s`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  // RegExp rule with flag
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `/(TXT|BMP|CSS)/i`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // RegExp rule with no flag
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `/(TXT|BMP|CSS)/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  // RegExp rule
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `/(?!py).+/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(zip.files["page.html"]);
  assert(Object.keys(zip.files).length === 5);

  // match full extension
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `/tx/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);
}

/**
 * Check urlFilter syntax
 *
 * capture.downLink.urlFilter
 */
async function test_capture_downLink03() {
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
${localhost}/capture_downLink/file.bmp
${localhost}/capture_downLink/file.css#whatever
${localhost}/capture_downLink/mime.py#foo
${localhost}/capture_downLink/redirect.pyr#bar`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file2.txt"]);
  assert(Object.keys(zip.files).length === 3);

  // plain text rule must match full URL
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `txt, bmp, css`,
    // 1. should not match
    // 2. should match (hash in URL is stripped)
    "capture.downLink.urlFilter": `\
capture_downLink/mime.py
${localhost}/capture_downLink/file.css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file2.txt"]);
  assert(zip.files["file3.txt"]);
  assert(zip.files["file4.txt"]);
  assert(zip.files["file.bmp"]);
  assert(Object.keys(zip.files).length === 6);

  // chars after spaces should be stripped for a plain text rule
  var options = {
    "capture.downLink.file.mode": "header",
    "capture.downLink.file.extFilter": `txt, bmp, css`,
    // 1. should not match
    // 2. should match (hash in URL is stripped)
    "capture.downLink.urlFilter": `\
capture_downLink/mime.py  foo
${localhost}/capture_downLink/file.css\tbar`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file2.txt"]);
  assert(zip.files["file3.txt"]);
  assert(zip.files["file4.txt"]);
  assert(zip.files["file.bmp"]);
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
    url: `${localhost}/capture_downLink/basic.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file4.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 5);
}

/**
 * Check basic in-depth capture
 *
 * capture.downLink.doc.depth
 */
async function test_capture_downLink04() {
  /* depth = null */
  var options = {
    "capture.downLink.doc.depth": null,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink2/in-depth.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.documentElement.hasAttribute('data-scrapbook-type'));
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink2/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink2/linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink2/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink2/linked1-4.html#444`);

  assert(!zip.file('index.json'));

  /* depth = 0 */
  var options = {
    "capture.downLink.doc.depth": 0,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink2/in-depth.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 2);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'site');
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink2/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink2/linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink2/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink2/linked1-4.html#444`);

  var sitemapFile = zip.file('index.json');
  var sitemapBlob = new Blob([await sitemapFile.async('blob')], {type: "application/json"});
  var expectedData = {
    "version": 2,
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
        "url": `${localhost}/capture_downLink2/in-depth.html`,
        "role": "document",
        "token": "43ed95c190934482c9d2e9c6c9843389aa5dd8a9"
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
    url: `${localhost}/capture_downLink2/in-depth.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'site');
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `linked1-5.html#555`);

  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/linked2-1.html#111`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink2/linked2-2.html#222`);

  var indexFile = zip.file('linked1-3.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-5.html#555`);

  var indexFile = zip.file('linked1-4.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `index.html#iii`);

  var indexFile = zip.file('linked1-5.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  assert(!zip.file('linked2-1.html'));

  assert(!zip.file('linked2-2.html'));

  var sitemapFile = zip.file('index.json');
  var sitemapBlob = new Blob([await sitemapFile.async('blob')], {type: "application/json"});
  var expectedData = {
    "version": 2,
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
        "url": `${localhost}/capture_downLink2/in-depth.html`,
        "role": "document",
        "token": "43ed95c190934482c9d2e9c6c9843389aa5dd8a9"
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
        "url": `${localhost}/capture_downLink2/linked1-1.html`,
        "role": "document",
        "token": "f174e5b40ed6d6625cdc96cc4d303d90d2334f23"
      },
      {
        "path": "linked1-2.html",
        "url": `${localhost}/capture_downLink2/linked1-2.html`,
        "role": "document",
        "token": "3e0df29c7ae372d83faf18d1d6eccaddb5a067b4"
      },
      {
        "path": "linked1-3.html",
        "url": `${localhost}/capture_downLink2/linked1-3.html`,
        "role": "document",
        "token": "d1829b8fee028fc6c556d002f8292db5bab3fb3c"
      },
      {
        "path": "linked1-4.html",
        "url": `${localhost}/capture_downLink2/linked1-4.html`,
        "role": "document",
        "token": "9b3e5bb43f8f839cd7014edc6820091decdc21ef"
      },
      {
        "path": "linked1-5.html",
        "url": `${localhost}/capture_downLink2/linked1-5.html`,
        "role": "document",
        "token": "02279cec1f4a7bc19eafbeab953d782ab8848a8a"
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));

  /* depth = 2 */
  var options = {
    "capture.downLink.doc.depth": 2,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink2/in-depth.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.documentElement.getAttribute('data-scrapbook-type') === 'site');
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `linked1-5.html#555`);

  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked2-1.html#111`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked2-2.html#222`);

  var indexFile = zip.file('linked1-3.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-5.html#555`);

  var indexFile = zip.file('linked1-4.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `index.html#iii`);

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
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/linked3-1.html#111`);

  var sitemapFile = zip.file('index.json');
  var sitemapBlob = new Blob([await sitemapFile.async('blob')], {type: "application/json"});
  var expectedData = {
    "version": 2,
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
        "url": `${localhost}/capture_downLink2/in-depth.html`,
        "role": "document",
        "token": "43ed95c190934482c9d2e9c6c9843389aa5dd8a9"
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
        "url": `${localhost}/capture_downLink2/linked1-1.html`,
        "role": "document",
        "token": "f174e5b40ed6d6625cdc96cc4d303d90d2334f23"
      },
      {
        "path": "linked1-2.html",
        "url": `${localhost}/capture_downLink2/linked1-2.html`,
        "role": "document",
        "token": "3e0df29c7ae372d83faf18d1d6eccaddb5a067b4"
      },
      {
        "path": "linked1-3.html",
        "url": `${localhost}/capture_downLink2/linked1-3.html`,
        "role": "document",
        "token": "d1829b8fee028fc6c556d002f8292db5bab3fb3c"
      },
      {
        "path": "linked1-4.html",
        "url": `${localhost}/capture_downLink2/linked1-4.html`,
        "role": "document",
        "token": "9b3e5bb43f8f839cd7014edc6820091decdc21ef"
      },
      {
        "path": "linked1-5.html",
        "url": `${localhost}/capture_downLink2/linked1-5.html`,
        "role": "document",
        "token": "02279cec1f4a7bc19eafbeab953d782ab8848a8a"
      },
      {
        "path": "linked2-1.html",
        "url": `${localhost}/capture_downLink2/linked2-1.html`,
        "role": "document",
        "token": "ba8d72438189a5c55c2b9a65ca8fec4d3b352271"
      },
      {
        "path": "linked2-2.html",
        "url": `${localhost}/capture_downLink2/linked2-2.html`,
        "role": "document",
        "token": "404c6de9eb35633a65170a9164e177be3d311901"
      }
    ]
  };
  assert(await readFileAsText(sitemapBlob) === JSON.stringify(expectedData, null, 1));
}

/**
 * Check no in-depth for singleHtml
 *
 * capture.downLink.doc.depth
 * capture.saveAs
 */
async function test_capture_downLink05() {
  /* depth = 0 */
  var options = {
    "capture.downLink.doc.depth": 0,
    "capture.saveAs": "singleHtml",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink2/in-depth.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assert(!doc.documentElement.hasAttribute('data-scrapbook-type'));
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink2/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink2/linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink2/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink2/linked1-4.html#444`);

  /* depth = 1 */
  var options = {
    "capture.downLink.doc.depth": 1,
    "capture.saveAs": "singleHtml",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink2/in-depth.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  assert(!doc.documentElement.hasAttribute('data-scrapbook-type'));
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink2/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `${localhost}/capture_downLink2/linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink2/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink2/linked1-4.html#444`);
}

/**
 * Check downLink.file should overwrite downLink.doc
 *
 * capture.downLink.file.mode
 * capture.downLink.file.extFilter
 * capture.downLink.doc.depth
 */
async function test_capture_downLink06() {
  var options = {
    "capture.downLink.file.mode": "url",
    "capture.downLink.file.extFilter": `bmp, html`,
    "capture.downLink.doc.depth": 1,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink2/in-depth.html`,
    mode: "source",
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
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `linked1-5.html#555`);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `./linked2-1.html#111`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `./linked2-2.html#222`);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-3.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `./linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `./linked1-5.html#555`);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-4.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `./in-depth.html#iii`);

  // downloaded as file (not rewritten)
  var indexFile = zip.file('linked1-5.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  assert(!zip.file('linked2-1.html'));

  assert(!zip.file('linked2-2.html'));
}

/**
 * Check urlFilter for doc
 *
 * capture.downLink.doc.depth
 * capture.downLink.doc.urlFilter
 */
async function test_capture_downLink07() {
  /* plain URLs */
  var options = {
    "capture.downLink.doc.depth": 2,
    "capture.downLink.doc.urlFilter": `\
${localhost}/capture_downLink2/linked1-2.html
${localhost}/capture_downLink2/linked2-1.html`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink2/in-depth.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink2/linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink2/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink2/linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `${localhost}/capture_downLink2/linked1-5.html#555`);

  assert(!zip.file('linked1-1.html'));

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `linked2-1.html#111`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink2/linked2-2.html#222`);

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
    url: `${localhost}/capture_downLink2/in-depth.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/file.bmp`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `linked1-1.html#111`);
  assert(doc.querySelectorAll('a')[2].getAttribute('href') === `linked1-2.html#222`);
  assert(doc.querySelectorAll('a')[3].getAttribute('href') === `${localhost}/capture_downLink2/linked1-3.html#333`);
  assert(doc.querySelectorAll('a')[4].getAttribute('href') === `${localhost}/capture_downLink2/linked1-4.html#444`);
  assert(doc.querySelectorAll('a')[5].getAttribute('href') === `${localhost}/capture_downLink2/linked1-5.html#555`);

  var indexFile = zip.file('linked1-1.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc);

  var indexFile = zip.file('linked1-2.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_downLink2/linked2-1.html#111`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink2/linked2-2.html#222`);

  assert(!zip.file('linked1-3.html'));

  assert(!zip.file('linked1-4.html'));

  assert(!zip.file('linked1-5.html'));

  assert(!zip.file('linked2-1.html'));

  assert(!zip.file('linked2-2.html'));
}

/**
 * Check link rebuild for XHTML and SVG
 *
 * capture.downLink.doc.depth
 */
async function test_capture_downLink08() {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink3/in-depth.html`,
    mode: "source",
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
}

/**
 * A pages linked from a frame should have same depth as from the main page.
 *
 * capture.downLink.doc.depth
 */
async function test_capture_downLink09() {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink4/in-depth.html`,
    mode: "source",
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
}

/**
 * Check frame renaming for deep pages.
 *
 * capture.downLink.doc.depth
 * capture.frameRename
 */
async function test_capture_downLink10() {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.downLink.doc.depth": 1,
  };

  /* frameRename = true */
  options["capture.frameRename"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink5/in-depth.html`,
    mode: "source",
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
    url: `${localhost}/capture_downLink5/in-depth.html`,
    mode: "source",
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
}

/**
 * Check links in shadow DOMs are rebuilt
 *
 * capture.downLink.doc.depth
 */
async function test_capture_downLink11() {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink6/in-depth.html`,
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
}

/**
 * Check links rewrite for meta refresh and redirect
 *
 * capture.downLink.doc.depth
 */
async function test_capture_downLink12() {
  var options = {
    "capture.downLink.doc.depth": 1,
  };

  /* meta refresh */
  var blob = await capture({
    url: `${localhost}/capture_downLink7/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `refreshed.html#linked2-1`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink7/linked1-2.html#in-depth`);

  /* redirect */
  var blob = await capture({
    url: `${localhost}/capture_downLink8/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `redirected.html#in-depth`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_downLink8/linked1-2.pyr#in-depth`);
}

/**
 * Check URL for data: in index.json
 *
 * capture.downLink.doc.depth
 */
async function test_capture_downLink13() {
  var options = {
    "capture.downLink.doc.depth": 1,
    "capture.saveDataUriAsFile": true,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink9/in-depth.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `test.bmp`);

  var sitemapFile = zip.file('index.json');
  var sitemapBlob = new Blob([await sitemapFile.async('blob')], {type: "application/json"});
  var expectedData = {
    "version": 2,
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
        "url": `${localhost}/capture_downLink9/in-depth.html`,
        "role": "document",
        "token": "62d1916b2e5f61142c5bb1cf2d337f06c7159237"
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
}

/**
 * Check if the URL in a meta refresh is rewritten correctly
 *
 * capturer.captureDocument
 */
async function test_capture_metaRefresh() {
  var blob = await capture({
    url: `${localhost}/capture_metaRefresh/delayed.html`,
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
  assert(mrs[3].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh/delayed.html?id=123`);
  assert(mrs[4].getAttribute('content') === `30`);
  assert(mrs[5].getAttribute('content') === `30; url=#`);
  assert(mrs[6].getAttribute('content') === `30; url=#123`);
  assert(mrs[7].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh/delayed.html?id=123`);
  assert(mrs[8].getAttribute('content') === `20; url=${localhost}/capture_metaRefresh/referred.html`);
  assert(mrs[9].getAttribute('content') === `20; url=${localhost}/capture_metaRefresh/referred.html#`);
  assert(mrs[10].getAttribute('content') === `20; url=${localhost}/capture_metaRefresh/referred.html#123`);
  assert(mrs[11].getAttribute('content') === `20; url=${localhost}/capture_metaRefresh/referred.html?id=123`);
  assert(mrs[12].getAttribute('content') === `15; url=http://example.com/`);
  assert(mrs[13].getAttribute('content') === `15; url=http://example.com/#`);
  assert(mrs[14].getAttribute('content') === `15; url=http://example.com/#123`);
  assert(mrs[15].getAttribute('content') === `15; url=http://example.com/?id=123`);
}

/**
 * Check local selection
 * a meta refresh URL pointing to a not captured part of self page should be resolved to original page
 *
 * capturer.captureDocument
 */
async function test_capture_metaRefresh2() {
  /* refresh link target not captured */
  var blob = await capture({
    url: `${localhost}/capture_metaRefresh2/delayed21.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `30`);
  assert(mrs[1].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh2/delayed21.html#123`);
  assert(mrs[2].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh2/delayed21.html?id=123`);
  assert(mrs[3].getAttribute('content') === `30`);
  assert(mrs[4].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh2/delayed21.html#123`);
  assert(mrs[5].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh2/delayed21.html?id=123`);
  assert(mrs[6].getAttribute('content') === `20; url=${localhost}/capture_metaRefresh2/referred.html`);
  assert(mrs[7].getAttribute('content') === `15; url=http://example.com/`);

  /* refresh link target captured */
  var blob = await capture({
    url: `${localhost}/capture_metaRefresh2/delayed22.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `30`);
  assert(mrs[1].getAttribute('content') === `30; url=#123`);
  assert(mrs[2].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh2/delayed22.html?id=123`);
  assert(mrs[3].getAttribute('content') === `30`);
  assert(mrs[4].getAttribute('content') === `30; url=#123`);
  assert(mrs[5].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh2/delayed22.html?id=123`);
  assert(mrs[6].getAttribute('content') === `20; url=${localhost}/capture_metaRefresh2/referred.html`);
  assert(mrs[7].getAttribute('content') === `15; url=http://example.com/`);
}

/**
 * Check when base is set to another page
 *
 * capturer.captureDocument
 */
async function test_capture_metaRefresh3() {
  var blob = await capture({
    url: `${localhost}/capture_metaRefresh3/delayed3.html`,
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
  assert(mrs[3].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh3/delayed3.html?id=123`);
  assert(mrs[4].getAttribute('content') === `30`);
  assert(mrs[5].getAttribute('content') === `30; url=#`);
  assert(mrs[6].getAttribute('content') === `30; url=#123`);
  assert(mrs[7].getAttribute('content') === `30; url=${localhost}/capture_metaRefresh3/delayed3.html?id=123`);
  assert(mrs[8].getAttribute('content') === `20; url=${localhost}/capture_metaRefresh3/referred.html`);
  assert(mrs[9].getAttribute('content') === `20; url=${localhost}/capture_metaRefresh3/subdir/referred.html`);
  assert(mrs[10].getAttribute('content') === `15; url=http://example.com/`);
}

/**
 * Check meta refresh resolve for source/bookmark.
 *
 * capturer.captureDocument
 */
async function test_capture_metaRefresh4() {
  /* source */
  var blob = await captureHeadless({
    url: `${localhost}/capture_metaRefresh4/refresh.html`,
    mode: 'source',
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_metaRefresh4/target.html#abc`);

  /* bookmark */
  var blob = await captureHeadless({
    url: `${localhost}/capture_metaRefresh4/refresh.html`,
    mode: 'bookmark',
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_metaRefresh4/target.html#abc`);
}

/**
 * Check meta refresh resolve to file for source/bookmark.
 *
 * capturer.captureDocument
 */
async function test_capture_metaRefresh5() {
  /* source */
  var blob = await captureHeadless({
    url: `${localhost}/capture_metaRefresh5/refresh.html`,
    mode: 'source',
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_metaRefresh5/target.txt#abc`);

  /* bookmark */
  var blob = await captureHeadless({
    url: `${localhost}/capture_metaRefresh5/refresh.html`,
    mode: 'bookmark',
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_metaRefresh5/target.txt#abc`);
}

/**
 * Meta refresh in <noscript> should be ignored.
 *
 * capturer.captureDocument
 */
async function test_capture_metaRefresh6() {
  /* source */
  var blob = await captureHeadless({
    url: `${localhost}/capture_metaRefresh6/refresh.html`,
    mode: 'source',
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_metaRefresh6/refresh.html`);

  /* bookmark */
  var blob = await captureHeadless({
    url: `${localhost}/capture_metaRefresh6/refresh.html`,
    mode: 'bookmark',
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);

  assert(doc.documentElement.getAttribute('data-scrapbook-source') === `${localhost}/capture_metaRefresh6/refresh.html`);
}

/**
 * Check if option works
 *
 * capture.contentSecurityPolicy
 */
async function test_capture_contentSecurityPolicy() {
  /* capture.contentSecurityPolicy = save */
  var options = {
    "capture.contentSecurityPolicy": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_contentSecurityPolicy/csp.html`,
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
    url: `${localhost}/capture_contentSecurityPolicy/csp.html`,
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
}

/**
 * Check handling of crossorigin attribute
 */
async function test_capture_crossorigin() {
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
}

/**
 * Check handling of integrity attribute
 */
async function test_capture_integrity() {
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
}

/**
 * Check if option works
 *
 * capture.referrerPolicy
 *
 * @TODO: check for HTTPS->HTTP downgrading
 * @TODO: check for username, password, local scheme
 */
async function test_capture_referrer() {
  /* capture.referrerPolicy = no-referrer */
  var options = {
    "capture.referrerPolicy": "no-referrer",
  };
  var blob = await capture({
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
  var blob = await capture({
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
  var blob = await capture({
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
  var blob = await capture({
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
  var blob = await capture({
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
  var blob = await capture({
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
  var blob = await capture({
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
  var blob = await capture({
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
}

/**
 * Check if referrer spoofing works
 *
 * capture.referrerSpoofSource
 * capture.referrerPolicy
 */
async function test_capture_referrer2() {
  /* capture.referrerSpoofSource = false */
  var options = {
    "capture.referrerPolicy": "unsafe-url",
    "capture.referrerSpoofSource": false,
  };
  var blob = await capture({
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
  var blob = await capture({
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
  var blob = await capture({
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
}

/**
 * Check if option works
 *
 * capture.recordDocumentMeta
 * capturer.captureDocument
 * capturer.captureFile
 * capturer.captureBookmark
 */
async function test_capture_record_meta() {
  /* html; +capture.recordDocumentMeta */
  var options = {
    "capture.recordDocumentMeta": true,
  };
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
  assert(html.getAttribute('data-scrapbook-create').match(/^\d{17}$/));

  /* html; -capture.recordDocumentMeta */
  var options = {
    "capture.recordDocumentMeta": false,
  };
  var blob = await capture({
    url: `${localhost}/capture_record/meta.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var html = doc.documentElement;

  assert(!html.hasAttribute('data-scrapbook-source'));
  assert(!html.hasAttribute('data-scrapbook-create'));

  /* text (Big5); +capture.recordDocumentMeta */
  var options = {
    "capture.recordDocumentMeta": true,
  };
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
  assert(html.getAttribute('data-scrapbook-create').match(/^\d{17}$/));
  assert(html.getAttribute('data-scrapbook-type') === 'file');
  assert(html.getAttribute('data-scrapbook-charset') === 'Big5');

  /* text (Big5); -capture.recordDocumentMeta */
  var options = {
    "capture.recordDocumentMeta": false,
  };
  var blob = await capture({
    url: `${localhost}/capture_record/text.py`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var html = doc.documentElement;

  assert(!html.hasAttribute('data-scrapbook-source'));
  assert(!html.hasAttribute('data-scrapbook-create'));
  assert(!html.hasAttribute('data-scrapbook-type'));
  assert(!html.hasAttribute('data-scrapbook-charset'));

  /* bookmark; +capture.recordDocumentMeta */
  var options = {
    "capture.recordDocumentMeta": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_record/meta.html`,
    mode: "bookmark",
    options: Object.assign({}, baseOptions, options),
  });
  var doc = await readFileAsDocument(blob);
  var html = doc.documentElement;

  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.html`);
  assert(html.getAttribute('data-scrapbook-create').match(/^\d{17}$/));
  assert(html.getAttribute('data-scrapbook-type') === 'bookmark');

  /* bookmark; -capture.recordDocumentMeta */
  var options = {
    "capture.recordDocumentMeta": false,
  };
  var blob = await capture({
    url: `${localhost}/capture_record/meta.html`,
    mode: "bookmark",
    options: Object.assign({}, baseOptions, options),
  });
  var doc = await readFileAsDocument(blob);
  var html = doc.documentElement;

  assert(!html.hasAttribute('data-scrapbook-source'));
  assert(!html.hasAttribute('data-scrapbook-create'));
  assert(!html.hasAttribute('data-scrapbook-type'));
}

/**
 * Check if hash is recorded in main document and NOT in frames
 *
 * capture.recordDocumentMeta
 * capturer.captureDocument
 * capturer.captureFile
 * capturer.captureBookmark
 */
async function test_capture_record_meta2() {
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
    mode: "source",
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
    mode: "source",
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
}

/**
 * The recorded URL should be the redirected one.
 *
 * capture.recordDocumentMeta
 * capturer.captureDocument
 * capturer.captureFile
 * capturer.captureBookmark
 */
async function test_capture_record_meta3() {
  /* html; +capture.recordDocumentMeta */
  var options = {
    "capture.recordDocumentMeta": true,
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_record/meta.pyr#abc`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var html = doc.documentElement;

  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_record/meta.html#abc`);
}

/**
 * Check if removed nodes are recorded
 *
 * capture.recordRewrites
 * capturer.captureDocument
 */
async function test_capture_record_nodes1() {
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
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var head = doc.querySelector('head');
  var body = doc.body;
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<base[^>]*?>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="shortcut icon"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="stylesheet"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="preload"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="prefetch"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<script[^>]*?>[\\s\\S]*?</script>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<img[^>]*? src=[^>]*?>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<img[^>]*? srcset=[^>]*?>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<picture>[\\s\\S]*?</picture>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<input[^>]*? type="image"[^>]*?>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<canvas[^>]*?>[\\s\\S]*?</canvas>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<audio[^>]*?>[\\s\\S]*?</audio>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<video[^>]*?>[\\s\\S]*?</video>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<video[^>]*?>[\\s\\S]*?</video>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<embed[^>]*?>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<object[^>]*?>[\\s\\S]*?</object>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<applet[^>]*?>[\\s\\S]*?</applet>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<iframe[^>]*?>[\\s\\S]*?</iframe>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<noscript[^>]*?>[\\s\\S]*?</noscript>-->`
  ).test(body.innerHTML));

  /* -capture.recordRewrites */  
  options["capture.recordRewrites"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/nodes1.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var head = doc.querySelector('head');
  var body = doc.body;
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<base[^>]*?>-->`
  ).test(head.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="shortcut icon"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="stylesheet"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="preload"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<script[^>]*?>[\\s\\S]*?</script>-->`
  ).test(head.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<img[^>]*? src=[^>]*?>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<img[^>]*? srcset=[^>]*?>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<picture>[\\s\\S]*?</picture>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<input[^>]*? type="image"[^>]*?>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<canvas[^>]*?>[\\s\\S]*?</canvas>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<audio[^>]*?>[\\s\\S]*?</audio>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<video[^>]*?>[\\s\\S]*?</video>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<video[^>]*?>[\\s\\S]*?</video>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<embed[^>]*?>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<object[^>]*?>[\\s\\S]*?</object>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<applet[^>]*?>[\\s\\S]*?</applet>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<iframe[^>]*?>[\\s\\S]*?</iframe>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<noscript[^>]*?>[\\s\\S]*?</noscript>-->`
  ).test(body.innerHTML));
}

/**
 * Check for removed source nodes in picture, audio, and video
 *
 * capture.recordRewrites
 * capturer.captureDocument
 */
async function test_capture_record_nodes2() {
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

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`
  ).test(doc.querySelector('picture').innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`
  ).test(doc.querySelector('audio').innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`
  ).test(doc.querySelector('video').innerHTML));

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
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`
  ).test(doc.querySelector('picture').innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`
  ).test(doc.querySelector('audio').innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`
  ).test(doc.querySelector('video').innerHTML));
}

/**
 * Check if added nodes are recorded.
 *
 * capture.recordRewrites
 * capturer.captureDocument
 */
async function test_capture_record_nodes3() {
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
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
  assert(doc.querySelector(`head:not([data-scrapbook-orig-null-node-${timeId}])`));
  assert(doc.querySelector(`meta[charset="UTF-8"]:not([data-scrapbook-orig-null-node-${timeId}])`));

  var blob = await capture({
    url: `${localhost}/capture_record/nodes4.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
  assert(doc.querySelector(`head:not([data-scrapbook-orig-null-node-${timeId}])`));
  assert(doc.querySelector(`meta[charset="UTF-8"]:not([data-scrapbook-orig-null-node-${timeId}])`));
}

/**
 * Check if changed attributes are recorded
 *
 * capture.recordRewrites
 * capturer.captureDocument
 */
async function test_capture_record_attrs1() {
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
  assert(doc.querySelector('meta[content]').getAttribute(`data-scrapbook-orig-attr-content-${timeId}`) === `text/html; charset=Big5`);
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
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(!doc.querySelector('meta').hasAttribute(`data-scrapbook-orig-attr-charset-${timeId}`));
  assert(!doc.querySelector('meta[content]').hasAttribute(`data-scrapbook-orig-attr-content-${timeId}`));
  assert(!doc.querySelector('body').hasAttribute(`data-scrapbook-orig-attr-onload-${timeId}`));
  assert(!doc.querySelector('div').hasAttribute(`data-scrapbook-orig-attr-style-${timeId}`));
  assert(!doc.querySelector('iframe').hasAttribute(`data-scrapbook-orig-attr-srcdoc-${timeId}`));
  assert(!doc.querySelector('a').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('input[type="checkbox"]').hasAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`));
  assert(!doc.querySelector('input[type="text"]').hasAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`));
  assert(!doc.querySelector('textarea').hasAttribute(`data-scrapbook-orig-textcontent-${timeId}`));
  assert(!doc.querySelector('select option').hasAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`));
}

/**
 * Check for changed attributes: save case
 *
 * capture.recordRewrites
 * capturer.captureDocument
 * capturer.DocumentCssHandler
 */
async function test_capture_record_attrs2() {
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
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(!doc.querySelector('link[rel="preload"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('link[rel="preload"]').hasAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`));
  assert(!doc.querySelector('link[rel="preload"]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('link[rel="preload"]').hasAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`));
  assert(!doc.querySelector('link[rel="prefetch"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('link[rel="prefetch"]').hasAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`));
  assert(!doc.querySelector('link[rel="prefetch"]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('link[rel="prefetch"]').hasAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`));
  assert(!doc.querySelector('link[rel~="icon"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('link[rel~="icon"]').hasAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`));
  assert(!doc.querySelector('link[rel~="icon"]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('link[rel~="icon"]').hasAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`));
  assert(!doc.querySelector('link[rel="stylesheet"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('link[rel="stylesheet"]').hasAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`));
  assert(!doc.querySelector('link[rel="stylesheet"]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('link[rel="stylesheet"]').hasAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`));
  assert(!doc.querySelector('script[src]').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('script[src]').hasAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`));
  assert(!doc.querySelector('script[src]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('script[src]').hasAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`));
  assert(!doc.querySelector('script:not([src])').hasAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`));
  assert(!doc.querySelector('img').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('img').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('img[srcset]').hasAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`));
  assert(!doc.querySelector('img[srcset]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('picture source').hasAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`));
  assert(!doc.querySelector('picture img').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('picture img').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('input[type="image"]').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('table').hasAttribute(`data-scrapbook-orig-attr-background-${timeId}`));
  assert(!doc.querySelector('table tr').hasAttribute(`data-scrapbook-orig-attr-background-${timeId}`));
  assert(!doc.querySelector('table tr th').hasAttribute(`data-scrapbook-orig-attr-background-${timeId}`));
  assert(!doc.querySelector('table tr td').hasAttribute(`data-scrapbook-orig-attr-background-${timeId}`));
  assert(!doc.querySelector('audio[src]').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('audio[src]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('audio:not([src])').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('audio source').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('video[src]').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('video[src]').hasAttribute(`data-scrapbook-orig-attr-poster-${timeId}`));
  assert(!doc.querySelector('video[src]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('video:not([src])').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('video source').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('iframe').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('embed').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('object').hasAttribute(`data-scrapbook-orig-attr-data-${timeId}`));
  assert(!doc.querySelector('applet').hasAttribute(`data-scrapbook-orig-attr-code-${timeId}`));
  assert(!doc.querySelector('applet').hasAttribute(`data-scrapbook-orig-attr-archive-${timeId}`));
  assert(!doc.querySelector('a').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));

  assert(!doc.querySelectorAll('svg a[*|href]')[0].hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelectorAll('svg a[*|href]')[1].hasAttribute(`xlink:data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelectorAll('svg image[*|href]')[0].hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelectorAll('svg image[*|href]')[1].hasAttribute(`xlink:data-scrapbook-orig-attr-href-${timeId}`));

  // CSS
  assert(doc.querySelector('style').textContent.trim() === `@import url("null.css");
@font-face { font-family: myFont; src: url("null.woff"); }
p { background-image: url("null.bmp"); }`);
  assert(doc.querySelector('div').getAttribute('style') === `background: url("null.bmp");`);
}

/**
 * Check for changed attributes: blank case
 * (save styles to save CSS and check image background and font)
 *
 * capture.recordRewrites
 * capturer.captureDocument
 * capturer.DocumentCssHandler
 */
async function test_capture_record_attrs3() {
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
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(!doc.querySelector('link[rel~="icon"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelectorAll('script')[0].hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelectorAll('script')[0].hasAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`));
  assert(!doc.querySelectorAll('script')[1].hasAttribute(`data-scrapbook-orig-textContent-${timeId}`));
  assert(!doc.querySelectorAll('script')[1].hasAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`));
  assert(!doc.querySelector('img').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelectorAll('img')[1].hasAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`));
  assert(!doc.querySelector('picture source').hasAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`));
  assert(!doc.querySelector('picture img').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('input[type="image"]').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('table').hasAttribute(`data-scrapbook-orig-attr-background-${timeId}`));
  assert(!doc.querySelector('table tr').hasAttribute(`data-scrapbook-orig-attr-background-${timeId}`));
  assert(!doc.querySelector('table tr th').hasAttribute(`data-scrapbook-orig-attr-background-${timeId}`));
  assert(!doc.querySelector('table tr td').hasAttribute(`data-scrapbook-orig-attr-background-${timeId}`));
  assert(!doc.querySelector('audio[src]').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('audio source').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('video[src]').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('video[src]').hasAttribute(`data-scrapbook-orig-attr-poster-${timeId}`));
  assert(!doc.querySelector('video source').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('iframe').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('embed').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('object').hasAttribute(`data-scrapbook-orig-attr-data-${timeId}`));
  assert(!doc.querySelector('applet').hasAttribute(`data-scrapbook-orig-attr-code-${timeId}`));
  assert(!doc.querySelector('applet').hasAttribute(`data-scrapbook-orig-attr-archive-${timeId}`));

  // CSS
  assert(doc.querySelector('style').textContent.trim() === `@import url("null.css");
@font-face { font-family: myFont; src: url(""); }
p { background-image: url(""); }`);
  assert(doc.querySelector('div').getAttribute('style') === `background: url("");`);
}

/**
 * Check for changed attributes: save-current case
 * (and blank style)
 *
 * capture.recordRewrites
 * capturer.captureDocument
 * capturer.DocumentCssHandler
 */
async function test_capture_record_attrs4() {
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
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(!doc.querySelector('link[rel="stylesheet"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('img').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelectorAll('img')[1].hasAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`));
  assert(!doc.querySelectorAll('img')[1].hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelectorAll('img')[1].hasAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`));
  assert(!doc.querySelector('picture img').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('audio[src]').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelectorAll('audio')[1].hasAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`));
  assert(!doc.querySelectorAll('audio')[1].hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('video[src]').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('video[src]').hasAttribute(`data-scrapbook-orig-attr-poster-${timeId}`));
  assert(!doc.querySelectorAll('video')[1].hasAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`));
  assert(!doc.querySelectorAll('video')[1].hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
}

/**
 * Check for changed attributes: for base
 *
 * capture.recordRewrites
 * capturer.captureDocument
 * capturer.DocumentCssHandler
 */
async function test_capture_record_attrs5() {
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
}

/**
 * Check if option works: for normal URL
 *
 * capture.linkUnsavedUri
 * capturer.captureDocument
 * capturer.downloadFile
 * capturer.captureUrl
 * capturer.captureBookmark
 */
async function test_capture_linkUnsavedUri1() {
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
    mode: "source",
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
    mode: "source",
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
}

/**
 * Test for downLink
 *
 * capture.linkUnsavedUri
 * capture.downLink.file.mode
 */
async function test_capture_linkUnsavedUri2() {
  var options = {
    "capture.downLink.file.extFilter": "txt",
    "capture.downLink.urlFilter": "",
  };

  /* -capture.linkUnsavedUri */
  options["capture.downLink.file.mode"] = "url";
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_linkUnsavedUri/error2.html`,
    mode: "source",
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
    mode: "source",
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
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelectorAll('a')[0].getAttribute('href') === `${localhost}/capture_linkUnsavedUri/nonexist.txt`);
  assert(doc.querySelectorAll('a')[1].getAttribute('href') === `${localhost}/capture_linkUnsavedUri/nonexist.css`);
}

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
async function test_capture_linkUnsavedUri3() {
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
    mode: "source",
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
}

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
async function test_capture_linkUnsavedUri4() {
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
    mode: "source",
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
}

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
async function test_capture_linkUnsavedUri5() {
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
    mode: "source",
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
}

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
async function test_capture_linkUnsavedUri6() {
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
    mode: "source",
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
}

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
async function test_capture_linkUnsavedUri7() {
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
}

/**
 * Test if option works.
 *
 * capture.insertInfoBar
 */
async function test_capture_insertInfoBar() {
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
}

/**
 * Check if SVG can be captured correctly.
 *
 * capturer.captureDocument
 */
async function test_capture_svg() {
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
  assert(zip.files["index.html"]);
  assert(zip.files["green.bmp"]);
  assert(zip.files["blue.bmp"]);
  assert(zip.files["script.js"]);
  assert(zip.files["script2.js"]);

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
  assert(zip.files["index.html"]);
  assert(zip.files["index.svg"]);
  assert(zip.files["green.bmp"]);

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
}

/**
 * Check if MathMl can be captured correctly.
 *
 * capturer.captureDocument
 */
async function test_capture_mathml() {
  /* embed.html */
  var options = {
    "capture.image": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_mathml/embed.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('math')[0].getAttribute('href') === `${localhost}/capture_mathml/resources/green.bmp`);
  assert(doc.querySelectorAll('math msup')[0].getAttribute('href') === `${localhost}/capture_mathml/resources/red.bmp`);
  assert(doc.querySelectorAll('math mi')[2].getAttribute('href') === `${localhost}/capture_mathml/resources/blue.bmp`);
}

/**
 * Check if no error when parent is to be removed and child is to be captured.
 *
 * capturer.captureDocument
 */
async function test_capture_recursive() {
  var options = {
    "capture.image": "remove",
    "capture.script": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_recursive/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(!zip.files["red.bmp"]);
  assert(!zip.files["blue.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('picture'));
  assert(!doc.querySelector('img'));
  assert(!doc.querySelector('script'));
}

/**
 * Check encoding and charset for getnerated data URLs.
 *
 * - Don't use Base64 encoding for text-like files.
 * - CSS should always use UTF-8 charset.
 *
 * capturer.captureDocument
 * capturer.downloadBlob
 */
async function test_capture_singleHtml_encoding() {
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
data:text/css;filename=link.css,%23external%20%7B%20background%3A%20url%28%22data%3Aimage/bmp%3Bfilename%3Dgreen.bmp%3Bbase64%2CQk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA%22%29%3B%20%7D%0A%23external%3A%3Aafter%20%7B%20content%3A%20%22%E5%A4%96%E9%83%A8%22%3B%20%7D%0A`);
  assert(doc.querySelectorAll('style')[1].textContent.trim() === `\
@import "data:text/css;filename=import.css,%23import%20%7B%20background%3A%20url%28%22data%3Aimage/bmp%3Bfilename%3Dgreen.bmp%3Bbase64%2CQk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA%22%29%3B%20%7D%0A%23import%3A%3Aafter%20%7B%20content%3A%20%22%E5%8C%AF%E5%85%A5%22%3B%20%7D%0A";`);
  assert(doc.querySelector('img').getAttribute('src') === `data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `data:text/plain;filename=big5.txt,Big5%A4%A4%A4%E5%A4%BA%AEe`);

  var srcdocBlob = new Blob([doc.querySelectorAll('iframe')[0].getAttribute('srcdoc')], {type: "text/html;charset=UTF-8"});
  var srcdoc = await readFileAsDocument(srcdocBlob);
  assert(srcdoc.querySelector('style').textContent.trim() === `\
#internal { background: url("data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA"); }
#internal::after { content: "內部"; }`);
  assert(srcdoc.querySelector('img').getAttribute('src') === `data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`);
}

/**
 * Check if CSS recources merging works
 *
 * capturer.captureDocument
 */
async function test_capture_singleHtml_mergeCss() {
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

  var o = (await getRulesFromCssText(doc.querySelector('style[data-scrapbook-elem="css-resource-map"]').textContent))[0].style;
  var map = Array.prototype.reduce.call(o, (a, c) => {
    a[`var(${c})`] = o.getPropertyValue(c);
    return a;
  }, {});

  // @import cannot use CSS variable
  var cssText = styles[0].textContent.trim();
  assert(cssText.match(/^@import "data:[^"]+";$/));

  // @font-face src cannot use CSS variable
  var cssText = styles[1].textContent.trim();
  assert(cssText.match(/src: url\("data:[^")]+"\);/));

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
  assert(cssText.match(/^@import "data:[^"]+";$/));

  // @font-face src cannot use CSS variable
  var cssText = styles[1].textContent.trim();
  assert(cssText.match(/src: url\("data:[^")]+"\);/));

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
}

/**
 * Generated filename parameter of data URL should use non-uniquified filename.
 */
async function test_capture_singleHtml_filename() {
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
}

/**
 * Escape bad tags for security
 *
 * capturer.captureDocument
 */
async function test_capture_invalid_tags() {
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

  assert(doc.querySelector('xmp').textContent.trim() === `Explode <\\/xmp> with a bomb!<script>alert("bomb");</script>`);
  assert(doc.querySelector('style').textContent.trim() === `/*Explode <\\/style> with a bomb!<script>alert("bomb");</script>*/`);
  assert(doc.querySelector('script').textContent.trim() === `/*Explode <\\/script> with a bomb!<script>alert("bomb");<\\/script>*/`);
}

/**
 * Size limit should be applied to normal resource and CSS.
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
async function test_capture_sizeLimit() {
  var options = {
    "capture.style": "save",
    "capture.image": "save",
  };

  /* sizeLimit = null */
  options["capture.resourceSizeLimit"] = null;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['link.css']);
  assert(zip.files['link2.css']);
  assert(zip.files['img.bmp']);
  assert(zip.files['img2.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('link')[0].getAttribute('href') === `link.css`);
  assert(doc.querySelectorAll('link')[1].getAttribute('href') === `link2.css`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `img.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `img2.bmp`);

  /* sizeLimit = 1KB; linkUnsavedUri = false */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['link.css']);
  assert(!zip.files['link2.css']);
  assert(zip.files['img.bmp']);
  assert(!zip.files['img2.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('link')[0].getAttribute('href') === `link.css`);
  assert(doc.querySelectorAll('link')[1].getAttribute('href') === `urn:scrapbook:download:error:${localhost}/capture_sizeLimit/link2.css`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `img.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_sizeLimit/img2.bmp`);

  /* sizeLimit = 1KB; linkUnsavedUri = true */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = true;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['link.css']);
  assert(!zip.files['link2.css']);
  assert(zip.files['img.bmp']);
  assert(!zip.files['img2.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('link')[0].getAttribute('href') === `link.css`);
  assert(doc.querySelectorAll('link')[1].getAttribute('href') === `${localhost}/capture_sizeLimit/link2.css`);
  assert(doc.querySelectorAll('img')[0].getAttribute('src') === `img.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute('src') === `${localhost}/capture_sizeLimit/img2.bmp`);
}

/**
 * Size limit should be applied to headless frames.
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
async function test_capture_sizeLimit2() {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.frame": "save",
  };

  /* sizeLimit = null */
  options["capture.resourceSizeLimit"] = null;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['index_1.html']);
  assert(zip.files['index_2.html']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = false */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['index_1.html']);
  assert(zip.files['index_2.html']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = true */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = true;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['index_1.html']);
  assert(zip.files['index_2.html']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = null; headless */
  options["capture.resourceSizeLimit"] = null;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit2/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['index_1.html']);
  assert(zip.files['index_2.html']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = false; headless */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit2/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['index_1.html']);
  assert(!zip.files['index_2.html']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_sizeLimit2/iframe2.html`);

  /* sizeLimit = 1KB; linkUnsavedUri = true; headless */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit2/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['index_1.html']);
  assert(!zip.files['index_2.html']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `${localhost}/capture_sizeLimit2/iframe2.html`);
}

/**
 * Size limit should NOT be applied to data URL.
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
async function test_capture_sizeLimit3() {
  var options = {
    "capture.style": "save",
    "capture.image": "save",
  };

  /* sizeLimit = 1KB */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit3/index.html`,
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
    url: `${localhost}/capture_sizeLimit3/index.html`,
    mode: "source",
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
}

/**
 * Size limit should NOT be applied to data URL (for frames).
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
async function test_capture_sizeLimit4() {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.frame": "save",
  };

  /* sizeLimit = 1KB */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;
  options["capture.saveDataUriAsFile"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_sizeLimit4/index.html`,
    mode: "source",
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
    url: `${localhost}/capture_sizeLimit4/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);
}

/**
 * Size limit should NOT be applied to srcdoc.
 *
 * capturer.captureDocument
 * capturer.linkUnsavedUri
 */
async function test_capture_sizeLimit5() {
  var options = {
    "capture.saveResourcesSequentially": true,
    "capture.frame": "save",
  };

  /* sizeLimit = 1KB */
  options["capture.resourceSizeLimit"] = 1 / 1024;
  options["capture.linkUnsavedUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_sizeLimit5/index.html`,
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
    url: `${localhost}/capture_sizeLimit5/index.html`,
    mode: "source",
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelectorAll('iframe')[0].getAttribute('src') === `index_1.html`);
  assert(doc.querySelectorAll('iframe')[1].getAttribute('src') === `index_2.html`);
}

/**
 * Check if capture helper works correctly.
 *
 * capturer.helpersEnabled
 * capture.helpers
 */
async function test_capture_helpers() {
  /* capture.helpers set and enabled */
  var options = {
    "capture.helpersEnabled": true,
    "capture.helpers": `\
[
  {
    "commands": [
      ["remove", "#exclude, .exclude, img"]
    ]
  }
]`,
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(!zip.files["red.bmp"]);
  assert(!zip.files["green.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(!doc.querySelector('#exclude'));
  assert(!doc.querySelector('.exclude'));
  assert(!doc.querySelector('img'));

  /* capture.helpers disabled */
  var options = {
    "capture.helpersEnabled": false,
    "capture.helpers": `\
[
  {
    "commands": [
      ["remove", "#exclude, .exclude, img"]
    ]
  }
]`,
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(zip.files["red.bmp"]);
  assert(zip.files["green.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('#exclude'));
  assert(doc.querySelector('.exclude'));
  assert(doc.querySelector('img'));

  /* capture.helpers invalid (regard as not set) */
  var options = {
    "capture.helpersEnabled": false,
    "capture.helpers": `[bad syntax]`,
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(zip.files["red.bmp"]);
  assert(zip.files["green.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('#exclude'));
  assert(doc.querySelector('.exclude'));
  assert(doc.querySelector('img'));

  /* capture.helpers not set */
  var options = {
    "capture.helpersEnabled": false,
    "capture.helpers": "",
  };

  var blob = await capture({
    url: `${localhost}/capture_helpers/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(zip.files["red.bmp"]);
  assert(zip.files["green.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('#exclude'));
  assert(doc.querySelector('.exclude'));
  assert(doc.querySelector('img'));
}

/**
 * Check nested capture helper.
 *
 * capturer.helpersEnabled
 * capture.helpers
 */
async function test_capture_helpers2() {
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
    url: `${localhost}/capture_helpers2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index.html"]);
  assert(zip.files["green.bmp"]);
  assert(!zip.files["red.bmp"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('img[src="green.bmp"]'));
}

async function test_viewer_validate() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer-validate/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_attachment() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer-attachment/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_interlink() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer-interlink/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_interlink2() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer-interlink2/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_interlink3() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer-interlink3/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_css_rules() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer-css-rules/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_metaRefresh() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer-metaRefresh/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_archive_in_frame() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer-archive-in-frame/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_csp() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer-csp/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function runTests(prefix = 'test_') {
  for (const t of Object.keys(window).filter(x => x.startsWith(prefix))) {
    await test(window[t]);
  }
}

async function runAutomatedTests() {
  await runTests('test_capture_');
}

async function runManualTests() {
  await runTests('test_viewer_');
}

/**
 * Main flow
 */
async function main() {
  const mode = new URL(location.href).searchParams.get('m');

  let time = Date.now();
  await init();

  if (mode == 1 || !mode) {
    testTotal = testPass = 0;
    await log(`Starting automated tests...\n`);
    await runAutomatedTests();
    await showTestResult();
    log(`\n`);
  }

  if (mode == 2 || !mode) {
    testTotal = testPass = 0;
    await log(`Starting manual tests...\n`);
    await runManualTests();
    await showTestResult();
    log(`\n`);
  }

  log(`Done in ${(Date.now() - time) / 1000} seconds.`);
}

main();
