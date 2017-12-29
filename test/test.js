/**
 * Configs
 */
const baseOptions = {
  "capture.saveInMemory": true,
  "capture.saveAs": "zip",
  "capture.saveAsciiFilename": false,
  "capture.saveBeyondSelection": false,
  "capture.saveFileAsHtml": false,
  "capture.saveDataUriAsFile": true,
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
  "capture.font": "save",
  "capture.style": "save",
  "capture.styleInline": "save",
  "capture.rewriteCss": "url",
  "capture.script": "save",
  "capture.noscript": "save",
  "capture.base": "blank",
  "capture.formStatus": "keep",
  "capture.downLink.mode": "none",
  "capture.downLink.extFilter": "",
  "capture.downLink.urlFilter": "",
  "capture.removeIntegrity": true,
  "capture.recordDocumentMeta": true,
  "capture.recordRemovedNode": false,
  "capture.recordRewrittenAttr": false,
  "capture.recordSourceUri": false,
  "capture.recordErrorUri": true,
};

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const MAF = "http://maf.mozdev.org/metadata/rdf#";

/**
 * Tests
 */

// Check html saving structure in various formats
// Check if saveAs option works
//
// capture.saveAs
// capturer.saveDocument
// capturer.downloadBlob
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
  assert(/^\d{17}\/$/.test(topdir));

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
  assert(blob.type === "text/html");

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

  /* singleHtmlJs */
  var options = {
    "capture.saveAs": "singleHtmlJs",
  };

  var blob = await capture({
    url: `${localhost}/capture_html/index.html`,
    options: Object.assign({}, baseOptions, options),
  });
  assert(blob.type === "text/html");

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

  var loaderElem = doc.querySelector('script[data-scrapbook-elem="pageloader"]');
  assert(loaderElem);
  assert(/\([\n\r]+(.+)[\n\r]+\);(?:\/\/[^\r\n]*|\/\*.*?\*\/)*$/.test(loaderElem.textContent));
  var loaderData = JSON.parse(RegExp.$1);
  assert(loaderData);
  assert(loaderData.length === 2);

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem);
  assert(/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(imgElem.src));
  var resType = RegExp.$1, resId = RegExp.$2;
  assert(resType === 'image/bmp');
  assert(loaderData[resId].p === 'red.bmp');
  assert(loaderData[resId].d === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem);
  assert(/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(imgElem.src));
  var resType = RegExp.$1, resId = RegExp.$2;
  assert(resType === 'image/bmp');
  assert(loaderData[resId].p === 'blue.bmp');
  assert(loaderData[resId].d === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
}

// Check if singleHtmlJs can handle special DOM cases
//
// capturer.saveDocument
async function test_capture_singleHtmlJs() {
  /* post-body contents */
  var options = {
    "capture.saveAs": "singleHtmlJs",
  };

  var blob = await capture({
    url: `${localhost}/capture_singleHtmlJs/post-body-tag.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  var loaderElem = doc.querySelector('script[data-scrapbook-elem="pageloader"]');
  assert(loaderElem);
}

// Check meta charset is correctly rewritten
//
// capturer.saveDocument
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

// Check xhtml saving structure in various formats
// Check if saveAs option works
//
// capture.saveAs
// capturer.saveDocument
// capturer.downloadBlob
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
  var metaRefreshElem = doc.querySelector('meta[http-equiv="refresh"][content="0;url=index.xhtml"]');
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
  var metaRefreshElem = doc.querySelector('meta[http-equiv="refresh"][content="0;url=index.xhtml"]');
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
  assert(blob.type === "application/xhtml+xml");

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

  /* singleHtmlJs */
  var options = {
    "capture.saveAs": "singleHtmlJs",
  };
  var blob = await capture({
    url: `${localhost}/capture_xhtml/index.xhtml`,
    options: Object.assign({}, baseOptions, options),
  });
  assert(blob.type === "application/xhtml+xml");

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

  var loaderElem = doc.querySelector('script[data-scrapbook-elem="pageloader"]');
  assert(loaderElem);
  assert(/\([\n\r]+(.+)[\n\r]+\);(?:\/\/[^\r\n]*|\/\*.*?\*\/)*$/.test(loaderElem.textContent));
  var loaderData = JSON.parse(RegExp.$1);
  assert(loaderData);
  assert(loaderData.length === 2);

  var imgElem = doc.querySelectorAll('img')[0];
  assert(imgElem);
  assert(/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(imgElem.src));
  var resType = RegExp.$1, resId = RegExp.$2;
  assert(resType === 'image/bmp');
  assert(loaderData[resId].p === 'red.bmp');
  assert(loaderData[resId].d === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

  var imgElem = doc.querySelectorAll('img')[1];
  assert(imgElem);
  assert(/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(imgElem.src));
  var resType = RegExp.$1, resId = RegExp.$2;
  assert(resType === 'image/bmp');
  assert(loaderData[resId].p === 'blue.bmp');
  assert(loaderData[resId].d === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
}

// Check file saving structure in various formats
// Check if saveAs option works
//
// capturer.captureFile
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
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0;url=file.bmp"]'));
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
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0;url=file.bmp"]'));
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
  assert(metaRefreshElem.getAttribute('content') === "0;url=" 
      + "data:image/bmp;filename=file.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
  assert(!doc.querySelector('a[href="file.bmp"]')); // do NOT generate anchor to avoid long content
  assert(!doc.querySelector('img'));

  /* singleHtmlJs */
  // @FIXME: singleHtmlJs for meta refresh doesn't work
  // Firefox doesn't respect meta refresh modification by JS,
  // and such meta refresh always goes to the empty data URL.
  var options = {
    "capture.saveAs": "singleHtmlJs",
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
  assert(metaRefreshElem.getAttribute('content') === "0;url=data:image/bmp;scrapbook-resource=0,");
  assert(doc.querySelector('a[href="data:image/bmp;scrapbook-resource=0,"]'));
  assert(!doc.querySelector('img'));

  var loaderElem = doc.querySelector('script[data-scrapbook-elem="pageloader"]');
  assert(/\([\n\r]+(.+)[\n\r]+\);(?:\/\/[^\r\n]*|\/\*.*?\*\/)*$/.test(loaderElem.textContent));
  var loaderData = JSON.parse(RegExp.$1);
  assert(loaderData);
  assert(loaderData.length === 1);
  assert(loaderData[0].p === 'file.bmp');
  assert(loaderData[0].d === 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
}

// Check plain text file encoding is correctly recorded
//
// capturer.captureFile
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
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0;url=big5.py"]'));

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
  assert(doc.querySelector('meta[http-equiv="refresh"][content="0;url=utf8.txt"]'));

  var savedFile = zip.file(topdir + 'utf8.txt');
  var text = (await readFileAsText(await savedFile.async('blob'))).trim();
  // The UTF-8 BOM is not included here.
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
}

// Check saved filename is correctly determined by HTTP header
// (filename, filename with encoding, or content-type)
//
// Check plain text file encoding is correctly recorded
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

// Check special chars handling for saved files and URLs pointing to them
//
// capturer.defaultFilesSet
// scrapbook.validateFilename
async function test_capture_filename() {
  var blob = await capture({
    url: `${localhost}/capture_filename/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["123ABCabc中文 !#$%&'()+,-;=@[]^_`{}-.css"]);
  assert(zip.files["中文 !_#$%&'()_+,-__;(=)_@[_]^_`{_}-.css"]);
  assert(zip.files["_"]);
  assert(zip.files["abc"]);
  assert(zip.files["_.css"]);
  assert(zip.files["abcd"]);
  assert(zip.files["abcde.css"]);
  assert(zip.files["abcdef"]);
  assert(zip.files["index-1.rdf"]);
  assert(zip.files["index-1.dat"]);
  assert(zip.files["metadata-1"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var links = doc.querySelectorAll('link');
  assert(links[0].getAttribute('href') === "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}-.css");
  assert(links[1].getAttribute('href') === "中文%20!_%23$%25&'()_+,-__;(=)_@[_]^_`{_}-.css");
  assert(links[2].getAttribute('href') === "_");
  assert(links[3].getAttribute('href') === "abc");
  assert(links[4].getAttribute('href') === "_.css");
  assert(links[5].getAttribute('href') === "abcd");
  assert(links[6].getAttribute('href') === "abcde.css");
  assert(links[7].getAttribute('href') === "abcdef");
  assert(links[8].getAttribute('href') === "index-1.rdf");
  assert(links[9].getAttribute('href') === "index-1.dat");
  assert(links[10].getAttribute('href') === "metadata-1");
}

// Check if option works
//
// capture.saveAsciiFilename
// capture.saveDataUriAsFile
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

// Check if option works
//
// capture.saveFileAsHtml
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

// Check if option works
//
// capture.saveDataUriAsFile
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

  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === "data:text/css;base64,Ym9keXtmb250LXNpemU6MjBweDt9");
  assert(doc.querySelector('style').textContent.trim() === `@import url("data:text/css;base64,Ym9keXtmb250LXNpemU6MjBweDt9");
@font-face { font-family: myFont; src: url("data:application/font-woff;base64,"); }
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
  assert(doc.querySelector('style').textContent.trim() === `@import url("2206b4fb7241bdce17a71015c888e3de66c2b5c9.css");
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
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === "data:text/css;base64,Ym9keXtmb250LXNpemU6MjBweDt9");
  assert(doc.querySelector('style').textContent.trim() === `@import url("data:text/css;base64,Ym9keXtmb250LXNpemU6MjBweDt9");
@font-face { font-family: myFont; src: url("data:application/font-woff;base64,"); }
p { background-image: url("data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"); }`);
  assert(doc.querySelector('img').getAttribute('src') === "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA 1x, data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA 2x");
}

// Check URL resolution in a data URL CSS
//
// capture.saveDataUriAsFile
// capturer.downloadFile
// capturer.processCssText
async function test_capture_dataUri_resolve() {
  var options = {
    "capture.style": "save",
    "capture.font": "save",
    "capture.imageBackground": "save",
  };

  /* -saveDataUriAsFile; relative link in data URL CSS */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri/resolve-css-1.html`,
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
    url: `${localhost}/capture_dataUri/resolve-css-2.html`,
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
@import "data:text/css;filename=null.css;base64,";
@font-face { font-family: myFont; src: url("data:application/octet-stream;filename=null.woff;base64,"); }
p { background-image: url("data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"); }`);

  /* +saveDataUriAsFile; relative link in data URL CSS */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri/resolve-css-1.html`,
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
    url: `${localhost}/capture_dataUri/resolve-css-2.html`,
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

// Check URL resolution in a data URL frame
//
// capture.saveDataUriAsFile
// capturer.captureDocument
async function test_capture_dataUri_resolve2() {
  var options = {
    "capture.frame": "save",
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": "txt",
    "capture.downLink.urlFilter": "",
  };

  /* -saveDataUriAsFile; relative link in data URL iframe */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = false;

  var blob = await capture({
    url: `${localhost}/capture_dataUri/resolve-frame-1.html`,
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
    url: `${localhost}/capture_dataUri/resolve-frame-2.html`,
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
  assert(frameDoc.querySelector('a').getAttribute('href') === `data:text/plain;filename=null.txt;base64,`);

  /* +saveDataUriAsFile; relative link in data URL iframe */
  // relative link => can't resolve and error (output original URL)
  options["capture.saveDataUriAsFile"] = true;

  var blob = await capture({
    url: `${localhost}/capture_dataUri/resolve-frame-1.html`,
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
    url: `${localhost}/capture_dataUri/resolve-frame-2.html`,
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

// Check if capture selection works
//
// capturer.captureDocument
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
  assert(doc.querySelector('#selected'));
  assert(doc.querySelector('img[src="green.bmp"]'));
  assert(zip.files["green.bmp"]);

  // the parents should also be included
  assert(doc.querySelector('#selection'));

  // Some browser supports multiple selection (e.g. Firefox), while some doesn't
  if (doc.querySelector('#selected2')) {
    assert(doc.querySelector('#selected2'));
    assert(doc.querySelector('img[src="yellow.bmp"]'));
    assert(zip.files["yellow.bmp"]);
    assert(doc.querySelector('#selection2'));
  } else {
    assert(!doc.querySelector('#selected2'));
    assert(!doc.querySelector('img[src="yellow.bmp"]'));
    assert(!zip.files["yellow.bmp"]);
    assert(!doc.querySelector('#selection2'));
  }

  // non-selected elements and resources
  assert(!doc.querySelector('#previous'));
  assert(!doc.querySelector('img[src="red.bmp"]'));
  assert(!zip.files["red.bmp"]);

  assert(!doc.querySelector('#middle'));

  assert(!doc.querySelector('#next'));
  assert(!doc.querySelector('img[src="blue.bmp"]'));
  assert(!zip.files["blue.bmp"]);
}

// When a headless capture (source, bookmark) is initialized from a
// tab, the tab information (e.g. title and favicon) should be used.
//
// capturer.captureTab
// capturer.captureHeadless
async function test_capture_headless() {
  /* from tab; source */
  var blob = await capture({
    url: `${localhost}/capture_headless/tab-info.html`,
    mode: "source",
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector(`title`).textContent.trim() === `My Title`);
  assert(doc.querySelector(`link[rel~="icon"]`).getAttribute('href') === `red.bmp`);
  assert(zip.files["red.bmp"]);

  /* from tab; bookmark */
  var blob = await capture({
    url: `${localhost}/capture_headless/tab-info.html`,
    mode: "bookmark",
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);
  assert(doc.querySelector(`title`).textContent.trim() === `My Title`);
  assert(doc.querySelector(`link[rel~="icon"]`).getAttribute('href') === `${localhost}/capture_headless/red.bmp`);

  /* from tab frame 0; source */
  var blob = await capture({
    url: `${localhost}/capture_headless/tab-info.html`,
    frameId: 0,
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

  /* from tab frame 0; bookmark */
  var blob = await capture({
    url: `${localhost}/capture_headless/tab-info.html`,
    frameId: 0,
    mode: "bookmark",
    options: baseOptions,
  });

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

// Check if captureBookmark works
//
// capturer.captureBookmark
async function test_capture_bookmark() {
  var blob = await capture({
    url: `${localhost}/capture_html/index.html`,
    mode: "bookmark",
    options: baseOptions,
  });

  var doc = await readFileAsDocument(blob);

  var html = doc.documentElement;
  assert(html.getAttribute('data-scrapbook-source') === `${localhost}/capture_html/index.html`);
  assert(/^\d{17}$/.test(html.getAttribute('data-scrapbook-create')));
  assert(html.getAttribute('data-scrapbook-type') === 'bookmark');

  assert(doc.querySelector(`meta[http-equiv="refresh"][content="0;url=${localhost}/capture_html/index.html"]`));
  assert(doc.querySelector(`a[href="${localhost}/capture_html/index.html"]`));
}

// Check frame capture if same origin
//
// capture.frame
async function test_capture_frame() {
  /* capture.frame = save */
  var options = {
    "capture.frame": "save",
  };

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
  assert(/^index_\d+\.html$/.test(frame.getAttribute('src')));
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
  assert(/^index_\d+\.xhtml$/.test(frame.getAttribute('src')));
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  // text.txt
  var frame = frames[2];
  assert(frame.getAttribute('src') === 'text.txt');
  var frameFile = zip.file(frame.getAttribute('src'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");

  /* capture.frame = link */
  var options = {
    "capture.frame": "link",
  };

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
  assert(frames[2].getAttribute('src') === `${localhost}/capture_frame/frames/text.txt`);

  /* capture.frame = blank */
  var options = {
    "capture.frame": "blank",
  };

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

  /* capture.frame = remove */
  var options = {
    "capture.frame": "remove",
  };

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

// Check frame capture if cross origin
//
// capture.frame
async function test_capture_frame2() {
  /* capture.frame = save */
  // Capture the frame content via content script and messaging.
  // The result should be same as same origin if it works normally.
  var options = {
    "capture.frame": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_frame/cross-origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  // frame1.html
  var frame = frames[0];
  assert(/^index_\d+\.html$/.test(frame.getAttribute('src')));
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
  assert(/^index_\d+\.xhtml$/.test(frame.getAttribute('src')));
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  // text.txt
  var frame = frames[2];
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

// Check frame capture if srcdoc
//
// capture.frame
async function test_capture_frame3() {
  /* capture.frame = save */
  // srcdoc should be removed
  // otherwise same as same origin
  var options = {
    "capture.frame": "save",
  };

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
  assert(/^index_\d+\.html$/.test(frame.getAttribute('src')));
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
  // keep original srcdoc and (resolved) src
  var options = {
    "capture.frame": "link",
  };

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
  assert(frame.getAttribute('srcdoc') === `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<script>
document.querySelector('p').textContent = 'srcdoc content modified';
</script>`);

  /* capture.frame = blank */
  // srcdoc should be removed
  var options = {
    "capture.frame": "blank",
  };

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

// Check headless frame save if same origin
//
// capture.frame
async function test_capture_frame_headless() {
  /* capture.frame = save */
  // frame contents are source (not modified by scripts) due to headless capture
  var options = {
    "capture.frame": "save",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/same-origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var frames = doc.querySelectorAll('iframe');

  var frame = frames[0];
  assert(/^index_\d+\.html$/.test(frame.getAttribute('src')));
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
  assert(/^index_\d+\.xhtml$/.test(frame.getAttribute('src')));
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
  var frameDoc = await readFileAsDocument(frameBlob);
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content`);
  assert(frameDoc.querySelector('img').getAttribute('src') === 'red.bmp');

  var frame = frames[2];
  assert(frame.getAttribute('src') === 'text.txt');
  var frameFile = zip.file(frame.getAttribute('src'));
  var text = (await readFileAsText(await frameFile.async('blob'))).trim();
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
}

// Check headless frame save if srcdoc
//
// capture.frame
async function test_capture_frame_headless2() {
  /* capture.frame = save */
  // keep original srcdoc and remove src
  //
  // @FIXME: rewrite srcdoc content
  //
  var options = {
    "capture.frame": "save",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame/srcdoc.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('iframe');
  assert(!frame.hasAttribute('src'));
  assert(frame.getAttribute('srcdoc') === `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<script>
document.querySelector('p').textContent = 'srcdoc content modified';
</script>`);
}

// Check headless frame capture if point to self
//
// capture.frame
async function test_capture_frame_headless3() {
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
}

// Check if circular frame referencing is handled correctly
//
// capture.frame
async function test_capture_frame_circular() {
  /* capture.frame = save */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.frame": "save",
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
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  // frame2.html
  var frame = frameDoc.querySelector('iframe');
  var frameFile = zip.file(frame.getAttribute('src'));
  var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
  var frameDoc = await readFileAsDocument(frameBlob);

  var frame = frameDoc.querySelector('iframe');
  assert(frame.src === `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular/index.html`);
}

// Check if self-pointing circular frame referencing is handled correctly
//
// capture.frame
async function test_capture_frame_circular2() {
  /* capture.frame = save */
  // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
  var options = {
    "capture.frame": "save",
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_frame_circular2/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var frame = doc.querySelector('iframe');
  assert(frame.src === `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular2/index.html`);
}

// Check data URI output for frame capture
//
// capture.frame
async function test_capture_frame_dataUri() {
  /* singleHtml */
  // data URI charset should be UTF-8
  var options = {
    "capture.saveAs": "singleHtml",
    "capture.frame": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_frame/same-origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('iframe');

  var frameSrc = frames[0].getAttribute('src');
  assert(/^data:text\/html;charset=UTF-8;filename=index_\d+\.html;base64,/.test(frameSrc));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);

  var frameSrc = frames[1].getAttribute('src');
  assert(/^data:application\/xhtml\+xml;charset=UTF-8;filename=index_\d+\.xhtml;base64,/.test(frameSrc));
  var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame2 content modified`);

  var frameSrc = frames[2].getAttribute('src');
  assert(/^data:text\/plain;filename=text\.txt;base64,/.test(frameSrc));
  var text = (await xhr({url: frameSrc, responseType: "text"})).response;
  assert(text === "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");

  /* singleHtmlJs */
  // frame page content and frame-referenced file content should be stored correctly
  var options = {
    "capture.saveAs": "singleHtmlJs",
    "capture.frame": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_frame/same-origin.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);
  var frames = doc.querySelectorAll('iframe');

  var loaderElem = doc.querySelector('script[data-scrapbook-elem="pageloader"]');
  assert(/\([\n\r]+(.+)[\n\r]+\);(?:\/\/[^\r\n]*|\/\*.*?\*\/)*$/.test(loaderElem.textContent));
  var loaderData = JSON.parse(RegExp.$1);
  assert(loaderData);
  assert(loaderData.length === 4);

  var frameSrc = frames[0].getAttribute('src');
  assert(/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(frameSrc));
  var resType = RegExp.$1, resId = RegExp.$2;
  assert(resType === 'text/html;charset=UTF-8');
  assert(/^index_\d+\.html$/.test(loaderData[resId].p));
  var url = `data:${resType};base64,${loaderData[resId].d}`;
  var frameDoc = (await xhr({url, responseType: "document"})).response;
  assert(frameDoc.querySelector('p').textContent.trim() === `frame1 content modified`);
}

// Check if option works
//
// capture.style
// capturer.captureDocument
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

// Check if option works
//
// capture.styleInline
// capturer.captureDocument
async function test_capture_css_styleInline() {
  var options = {
    "capture.style": "remove",
  };

  /* capture.styleInline = save */
  options["capture.styleInline"] = "save";

  var blob = await capture({
    url: `${localhost}/capture_css_style/style.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('blockquote').getAttribute('style') === `background: yellow;`);

  /* capture.styleInline = blank */
  options["capture.styleInline"] = "blank";

  var blob = await capture({
    url: `${localhost}/capture_css_style/style.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(doc.querySelector('blockquote').getAttribute('style') === ``);

  /* capture.styleInline = remove */
  options["capture.styleInline"] = "remove";

  var blob = await capture({
    url: `${localhost}/capture_css_style/style.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  assert(!doc.querySelector('blockquote').getAttribute('style'));
}

// Check if option works
//
// capture.rewriteCss
// capturer.processCssText
async function test_capture_css_rewriteCss() {
  /* capture.rewriteCss = save */
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

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  assert(doc.querySelector('style').textContent.trim() === `\
@import "imported.css";
@font-face { font-family: fontface; src: url("sansation_light.woff"); }
#background { background: url("green.bmp"); }`);

  assert(doc.querySelector('blockquote').getAttribute('style') === `background: url("green.bmp");`);

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

  assert(doc.querySelector('style').textContent.trim() === `\
@import "ref/imported.css";
@font-face { font-family: fontface; src: url(ref/sansation_light.woff); }
#background { background: url(ref/green.bmp); }`);

  assert(doc.querySelector('blockquote').getAttribute('style') === `background: url(ref/green.bmp);`);
}

// Check CSS syntax parsing
//
// scrapbook.parseCssText
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
  // assert(css[15].textContent.trim() === `#test15::after { content: "url(green.bmp);"; }`);
  assert(css[16].textContent.trim() === `#test16 { background: url("${localhost}/capture_css_syntax/He's%20file.bmp"); }`);

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

// Check encoding detection for an external or imported CSS
//
// scrapbook.parseCssFile
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

  var file = zip.file('header_big5.py');
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

  var file = zip.file('header_utf8_bom_utf8.py');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#test5::after { content: "中文"; }`);
  assert(!await hasBomUtf8(blob));

  var file = zip.file('header_utf8_at_big5.py');
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

// Check whether linked and imported CSS are all rewritten
// based to the CSS file (rather than the web page)
//
// inline and internal CSS are checked in test_capture_css_rewriteCss
async function test_capture_css_rewrite() {
  var options = {
    "capture.imageBackground": "link",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_rewrite/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);

  var file = zip.file('import.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#import { background: url("${localhost}/capture_css_rewrite/yellow.bmp"); }`);

  var file = zip.file('link.css');
  var blob = new Blob([await file.async('blob')], {type: "text/css"});
  var text = (await readFileAsText(blob)).trim();
  assert(text === `#link { background: url("${localhost}/capture_css_rewrite/yellow.bmp"); }`);
}

// Check if base is set to another directory
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

// Check for "" and hash URL
// They should be ignored and no file is retrieved
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

// Check for a URL pointing to main page (a bad case)
// It will be regarded as a CSS file: be fetched, parsed, and saved.
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

// Check if circular CSS referencing is handled correctly
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
  // rewrite a circular referencing with urn:scrapbook:download:circular:filename:...
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
  assert(/^@import "(data:text\/css;filename=style2.css;base64,[^"#]*)(?:#[^"]*)?";/.test(text));

  // style2.css
  var url = RegExp.$1;
  var text = (await xhr({url, responseType: "text"})).response;
  assert(/^@import "(data:text\/css;filename=style3.css;base64,[^"#]*)(?:#[^"]*)?";/.test(text));

  // style3.css
  var url = RegExp.$1;
  var text = (await xhr({url, responseType: "text"})).response;
  assert(text.trim() === `@import "urn:scrapbook:download:circular:filename:style1.css";
body { color: blue; }`);

  /* singleHtmlJs */
  // rewrite a circular referencing with urn:scrapbook:download:circular:filename:...
  var options = {
    "capture.saveAs": "singleHtmlJs",
    "capture.style": "save",
  };

  var blob = await capture({
    url: `${localhost}/capture_css_circular/index.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var doc = await readFileAsDocument(blob);

  var loaderElem = doc.querySelector('script[data-scrapbook-elem="pageloader"]');
  assert(/\([\n\r]+(.+)[\n\r]+\);(?:\/\/[^\r\n]*|\/\*.*?\*\/)*$/.test(loaderElem.textContent));
  var loaderData = JSON.parse(RegExp.$1);

  var url = doc.querySelector('link').getAttribute('href');
  assert(/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(url));
  var resType = RegExp.$1, resId = RegExp.$2;

  // style1.css
  var url = `data:${resType};base64,${loaderData[resId].d}`;
  var text = (await xhr({url, responseType: "text"})).response;
  assert(/^@import "(data:text\/css;[^"#]*)(?:#[^"]*)?";/.test(text));

  var url = RegExp.$1;
  assert(/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(url));
  var resType = RegExp.$1, resId = RegExp.$2;

  // style2.css
  var url = `data:${resType};base64,${loaderData[resId].d}`;
  var text = (await xhr({url, responseType: "text"})).response;
  assert(/^@import "(data:text\/css;[^"#]*)(?:#[^"]*)?";/.test(text));

  var url = RegExp.$1;
  assert(/^data:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/.test(url));
  var resType = RegExp.$1, resId = RegExp.$2;

  // style3.css
  var url = `data:${resType};base64,${loaderData[resId].d}`;
  var text = (await xhr({url, responseType: "text"})).response;
  assert(text.trim() === `@import "urn:scrapbook:download:circular:filename:style1.css";
body { color: blue; }`);
}

// Check if self-pointing circular CSS referencing is handled correctly
async function test_capture_css_circular2() {
  /* singleHtml */
  // rewrite a circular referencing with urn:scrapbook:download:circular:filename:...
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
  assert(text.trim() === `@import "urn:scrapbook:download:circular:filename:style1.css";
body { color: red; }`);
}

// Check if option works
//
// capture.image
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

// Check if option works
//
// capture.imageBackground
async function test_capture_imageBackground() {
  /* capture.imageBackground = save */
  var options = {
    "capture.imageBackground": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/background.html`,
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

  var pElem = doc.querySelector('p');
  assert(pElem.getAttribute('style') === `background: url("yellow.bmp");`);

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

  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/background.html`,
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

  var pElem = doc.querySelector('p');
  assert(pElem.getAttribute('style') === `background: url("yellow.bmp");`);

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

  /* capture.imageBackground = link */
  var options = {
    "capture.imageBackground": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/background.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var pElem = doc.querySelector('p');
  assert(pElem.getAttribute('style') === `background: url("${localhost}/capture_image/yellow.bmp");`);

  var bodyElem = doc.body;
  assert(bodyElem.getAttribute('background') === `${localhost}/capture_image/green.bmp`);
  var tableElem = doc.querySelector('table');
  assert(tableElem.getAttribute('background') === `${localhost}/capture_image/red.bmp`);
  var trElems = tableElem.querySelectorAll('tr');
  assert(trElems[0].getAttribute('background') === `${localhost}/capture_image/green.bmp`);
  var thElem = trElems[1].querySelector('th');
  assert(thElem.getAttribute('background') === `${localhost}/capture_image/blue.bmp`);
  var tdElem = trElems[1].querySelector('td');
  assert(tdElem.getAttribute('background') === `${localhost}/capture_image/yellow.bmp`);

  /* capture.imageBackground = blank */
  var options = {
    "capture.imageBackground": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/background.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var pElem = doc.querySelector('p');
  assert(pElem.getAttribute('style') === `background: url("");`);

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
}

// Check if used background images in the CSS are detected correctly
// Check if option works
//
// capture.imageBackground
async function test_capture_imageBackgroundUsed() {
  /* capture.imageBackground = save */
  var options = {
    "capture.imageBackground": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/background-used.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['background.css']);
  assert(zip.files['neverused.css']);
  assert(zip.files['red.bmp']);
  assert(zip.files['green.bmp']);
  assert(zip.files['yellow.bmp']);
  assert(zip.files['blue.bmp']);
  assert(zip.files['neverused.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `#internal_bg { background: url("red.bmp"); }`);
  assert(styleElems[1].textContent.trim() === `@keyframes spin {
  from { transform: rotate(0turn); background-image: url("red.bmp"); }
  to { transform: rotate(1turn); background-image: url("green.bmp"); }
}`);
  assert(styleElems[2].textContent.trim() === `#neverused { background: url("neverused.bmp"); }`);
  assert(styleElems[3].textContent.trim() === `@keyframes neverused {
  from { transform: rotate(0turn); background-image: url("neverused.bmp"); }
  to { transform: rotate(1turn); background-image: url("blue.bmp"); }
}`);

  var cssFile = zip.file('background.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link_bg { background: url("yellow.bmp"); }`);

  var cssFile = zip.file('neverused.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#neverused2 { background: url("neverused.bmp"); }`);

  /* capture.imageBackground = save-used */
  var options = {
    "capture.imageBackground": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/background-used.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['background.css']);
  assert(zip.files['neverused.css']);
  assert(zip.files['red.bmp']);
  assert(zip.files['green.bmp']);
  assert(zip.files['yellow.bmp']);
  assert(!zip.files['blue.bmp']);
  assert(!zip.files['neverused.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `#internal_bg { background: url("red.bmp"); }`);
  assert(styleElems[1].textContent.trim() === `@keyframes spin {
  from { transform: rotate(0turn); background-image: url("red.bmp"); }
  to { transform: rotate(1turn); background-image: url("green.bmp"); }
}`);
  assert(styleElems[2].textContent.trim() === `#neverused { background: url(""); }`);
  assert(styleElems[3].textContent.trim() === `@keyframes neverused {
  from { transform: rotate(0turn); background-image: url(""); }
  to { transform: rotate(1turn); background-image: url(""); }
}`);

  var cssFile = zip.file('background.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link_bg { background: url("yellow.bmp"); }`);

  var cssFile = zip.file('neverused.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#neverused2 { background: url(""); }`);

  /* capture.imageBackground = save-used (headless) */
  // the result is same as save
  var options = {
    "capture.imageBackground": "save-used",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_image/background-used.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['background.css']);
  assert(zip.files['neverused.css']);
  assert(zip.files['red.bmp']);
  assert(zip.files['green.bmp']);
  assert(zip.files['yellow.bmp']);
  assert(zip.files['blue.bmp']);
  assert(zip.files['neverused.bmp']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `#internal_bg { background: url("red.bmp"); }`);
  assert(styleElems[1].textContent.trim() === `@keyframes spin {
  from { transform: rotate(0turn); background-image: url("red.bmp"); }
  to { transform: rotate(1turn); background-image: url("green.bmp"); }
}`);
  assert(styleElems[2].textContent.trim() === `#neverused { background: url("neverused.bmp"); }`);
  assert(styleElems[3].textContent.trim() === `@keyframes neverused {
  from { transform: rotate(0turn); background-image: url("neverused.bmp"); }
  to { transform: rotate(1turn); background-image: url("blue.bmp"); }
}`);

  var cssFile = zip.file('background.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#link_bg { background: url("yellow.bmp"); }`);

  var cssFile = zip.file('neverused.css');
  var text = await readFileAsText(await cssFile.async('blob'));
  assert(text.trim() === `#neverused2 { background: url("neverused.bmp"); }`);
}

// Check if option works
//
// capture.favicon
async function test_capture_favicon() {
  /* capture.favicon = save */
  var options = {
    "capture.favicon": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/favicon.html`,
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
    url: `${localhost}/capture_image/favicon.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var iconElem = doc.querySelector('link[rel~="icon"]');
  assert(iconElem.getAttribute('href') === `${localhost}/capture_image/red.bmp`);

  /* capture.favicon = blank */
  var options = {
    "capture.favicon": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_image/favicon.html`,
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
    url: `${localhost}/capture_image/favicon.html`,
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

// Check if option works
//
// capture.canvas
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

  var canvasElem = doc.querySelector('#c1');
  var canvasLoaderElem = canvasElem.nextSibling;
  assert(canvasLoaderElem && canvasLoaderElem.nodeName.toLowerCase() === 'script');
  assert(/\bdata:image\/png;base64,/.test(canvasLoaderElem.textContent));

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

  var canvasElem = doc.querySelector('#c1');
  var canvasLoaderElem = canvasElem.nextSibling;
  assert(!(canvasLoaderElem && canvasLoaderElem.nodeName.toLowerCase() === 'script'));

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

  var canvasElem = doc.querySelector('#c1');
  assert(!canvasElem);
}

// Check if option works
//
// capture.audio
async function test_capture_audio() {
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
  assert(zip.files['horse.ogg']);
  assert(zip.files['horse.mp3']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var audioElems = doc.querySelectorAll('audio');
  assert(audioElems[0].getAttribute('src') === `horse.mp3`);
  var sourceElems = audioElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `horse.ogg`);
  assert(sourceElems[1].getAttribute('src') === `horse.mp3`);

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

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var audioElems = doc.querySelectorAll('audio');
  assert(audioElems[0].getAttribute('src') === `horse.mp3`);
  assert(audioElems[1].getAttribute('src') === `horse.ogg`
      || audioElems[1].getAttribute('src') === `horse.mp3`);
  var sourceElems = audioElems[1].querySelectorAll('source');
  assert(sourceElems.length === 0);

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
  assert(zip.files['horse.ogg']);
  assert(zip.files['horse.mp3']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var audioElems = doc.querySelectorAll('audio');
  assert(audioElems[0].getAttribute('src') === `horse.mp3`);
  var sourceElems = audioElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `horse.ogg`);
  assert(sourceElems[1].getAttribute('src') === `horse.mp3`);

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
}

// Check if option works
//
// capture.video
async function test_capture_video() {
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
  assert(zip.files['small.mp4']);
  assert(zip.files['small.webm']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var videoElems = doc.querySelectorAll('video');
  assert(videoElems[0].getAttribute('src') === `small.mp4`);
  assert(videoElems[0].getAttribute('poster') === `yellow.bmp`);
  var sourceElems = videoElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `small.webm`);
  assert(sourceElems[1].getAttribute('src') === `small.mp4`);

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
  assert(zip.files['small.mp4']);
  assert(zip.files['small.webm']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var videoElems = doc.querySelectorAll('video');
  assert(videoElems[0].getAttribute('src') === `small.mp4`);
  assert(videoElems[0].getAttribute('poster') === `yellow.bmp`);
  var sourceElems = videoElems[1].querySelectorAll('source');
  assert(sourceElems[0].getAttribute('src') === `small.webm`);
  assert(sourceElems[1].getAttribute('src') === `small.mp4`);

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
}

// Check if option works
// Check if used fonts in the CSS are detected correctly
//
// capture.font
async function test_capture_font() {
  /* capture.font = save */
  var options = {
    "capture.font": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_font/font.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['sansation_light.woff']);
  assert(zip.files['sansation_bold.woff']);
  assert(zip.files['neverused.woff']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: myFont; src: url("sansation_light.woff"); }`);
  assert(styleElems[1].textContent.trim() === `@font-face { font-family: myFont2; src: url("sansation_bold.woff"); font-weight: bold; }`);
  assert(styleElems[2].textContent.trim() === `@font-face { font-family: neverused; src: url("neverused.woff"); }`);

  /* capture.font = save-used */
  var options = {
    "capture.font": "save-used",
  };
  var blob = await capture({
    url: `${localhost}/capture_font/font.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['sansation_light.woff']);
  assert(zip.files['sansation_bold.woff']);
  assert(!zip.files['neverused.woff']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: myFont; src: url("sansation_light.woff"); }`);
  assert(styleElems[1].textContent.trim() === `@font-face { font-family: myFont2; src: url("sansation_bold.woff"); font-weight: bold; }`);
  assert(styleElems[2].textContent.trim() === `@font-face { font-family: neverused; src: url(""); }`);

  /* capture.font = save-used (headless) */
  // the result is same as save
  var options = {
    "capture.font": "save-used",
  };
  var blob = await captureHeadless({
    url: `${localhost}/capture_font/font.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['sansation_light.woff']);
  assert(zip.files['sansation_bold.woff']);
  assert(zip.files['neverused.woff']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: myFont; src: url("sansation_light.woff"); }`);
  assert(styleElems[1].textContent.trim() === `@font-face { font-family: myFont2; src: url("sansation_bold.woff"); font-weight: bold; }`);
  assert(styleElems[2].textContent.trim() === `@font-face { font-family: neverused; src: url("neverused.woff"); }`);

  /* capture.font = link */
  var options = {
    "capture.font": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_font/font.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: myFont; src: url("${localhost}/capture_font/sansation_light.woff"); }`);
  assert(styleElems[1].textContent.trim() === `@font-face { font-family: myFont2; src: url("${localhost}/capture_font/sansation_bold.woff"); font-weight: bold; }`);
  assert(styleElems[2].textContent.trim() === `@font-face { font-family: neverused; src: url("${localhost}/capture_font/neverused.woff"); }`);

  /* capture.font = blank */
  var options = {
    "capture.font": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_font/font.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var styleElems = doc.querySelectorAll('style');
  assert(styleElems[0].textContent.trim() === `@font-face { font-family: myFont; src: url(""); }`);
  assert(styleElems[1].textContent.trim() === `@font-face { font-family: myFont2; src: url(""); font-weight: bold; }`);
  assert(styleElems[2].textContent.trim() === `@font-face { font-family: neverused; src: url(""); }`);
}

// Check if option works
//
// capture.script
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
  assert(!body.getAttribute('onload'));
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
  assert(!body.getAttribute('onload'));
  var div = doc.querySelector('div');
  assert(!div.hasAttribute('onclick'));
}

// Check if option works
//
// capture.noscript
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

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var noscripts = doc.querySelectorAll('noscript');
  assert(noscripts[0].textContent.trim() === `Your browser does not support JavaScript.`);
  assert(noscripts[1].innerHTML.trim() === `<style>
body { background-color: red; }
</style>`);

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

// Check if option works
//
// capture.embed
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

// Check if option works
//
// capture.object
async function test_capture_object() {
  /* capture.object = save */
  var options = {
    "capture.object": "save",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/object.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files['demo.svg']);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var object = doc.querySelector('object');
  assert(object.getAttribute('data') === `demo.svg`);

  /* capture.object = link */
  var options = {
    "capture.object": "link",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/object.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var object = doc.querySelector('object');
  assert(object.getAttribute('data') === `${localhost}/capture_object/demo.svg`);

  /* capture.object = blank */
  var options = {
    "capture.object": "blank",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/object.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var object = doc.querySelector('object');
  assert(!object.hasAttribute('data'));

  /* capture.object = remove */
  var options = {
    "capture.object": "remove",
  };
  var blob = await capture({
    url: `${localhost}/capture_object/object.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var object = doc.querySelector('object');
  assert(!object);
}

// Check if option works
//
// capture.applet
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

// Check if option works
//
// capture.base
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
  var base = doc.querySelector('base');
  assert(base.getAttribute('href') === `http://example.com/`);
  assert(base.getAttribute('target') === `_blank`);

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
  var base = doc.querySelector('base');
  assert(!base.hasAttribute('href'));
  assert(base.getAttribute('target') === `_blank`);

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
  var base = doc.querySelector('base');
  assert(!base);
}

// Check if option works
//
// capture.formStatus
async function test_capture_formStatus() {
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
  assert(doc.querySelector('input[type="radio"]').hasAttribute('checked'));
  assert(doc.querySelector('input[type="checkbox"]').hasAttribute('checked'));
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
  assert(!doc.querySelector('input[type="radio"]').hasAttribute('checked'));
  assert(!doc.querySelector('input[type="checkbox"]').hasAttribute('checked'));
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

// Check if the URL for general saved resource is rewritten correctly
// when base is set to another directory.
//
// We take image for instance, and other resources should work same
// since they share same implementation.
//
// capturer.resolveRelativeUrl
// capturer.captureDocument
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

// Check for "", hash, search,
// and URL pointing to main html page (a bad case)
//
// capturer.resolveRelativeUrl
// capturer.captureDocument
async function test_capture_rewrite2() {
  var blob = await capture({
    url: `${localhost}/capture_rewrite2/index.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["index-1.html"]);
  assert(zip.files["index-2.html"]);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var imgs = doc.querySelectorAll('img');
  assert(imgs[0].getAttribute('src') === ``);
  assert(/^(?:|#123)$/i.test(imgs[1].getAttribute('src'))); // the browser may clear the hash for <img> when getting outerHTML
  assert(/^index-\d+\.html$/i.test(imgs[2].getAttribute('src'))); // html page saved as img
  assert(/^index-\d+\.html$/i.test(imgs[3].getAttribute('src'))); // html page saved as img
}

// Check if the URL in an anchor (link) is rewritten correctly
//
// capturer.captureDocument
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

// Check local selection
// a hash URL pointing to a not captured part of self page should be resolved to original page
//
// capturer.captureDocument
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

// Check when base is set to another page
//
// capturer.captureDocument
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

// Check if option works
//
// capture.downLink
async function test_capture_downLink() {
  /* header */
  var options = {
    "capture.downLink.mode": "header",
    "capture.downLink.extFilter": `txt, bmp, css`,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file2.txt"]);
  assert(zip.files["file3.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 6);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `file.txt`);
  assert(anchors[1].getAttribute('href') === `file.css#123`);
  assert(anchors[2].getAttribute('href') === `file.bmp`);
  assert(anchors[3].getAttribute('href') === `file2.txt`);
  assert(anchors[4].getAttribute('href') === `file3.txt`);

  /* url */
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `txt, bmp, css`,
  };

  var blob = await capture({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(!zip.files["file2.txt"]);
  assert(!zip.files["file3.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var anchors = doc.querySelectorAll('a');
  assert(anchors[0].getAttribute('href') === `file.txt`);
  assert(anchors[1].getAttribute('href') === `file.css#123`);
  assert(anchors[2].getAttribute('href') === `file.bmp`);
  assert(anchors[3].getAttribute('href') === `${localhost}/capture_downLink/filename.py`);
  assert(anchors[4].getAttribute('href') === `${localhost}/capture_downLink/mime.py`);

  /* none */
  var options = {
    "capture.downLink.mode": "none",
    "capture.downLink.extFilter": `txt, bmp, css`,
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
  assert(anchors[3].getAttribute('href') === `${localhost}/capture_downLink/filename.py`);
  assert(anchors[4].getAttribute('href') === `${localhost}/capture_downLink/mime.py`);
}

// Check extFilter syntax
//
// capture.downLink.extFilter
async function test_capture_downLink2() {
  // a rule each line
  // match URL (*.py) but download using resolved filename using header (*.txt)
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `txt\nbmp\ncss\npy`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
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
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `txt bmp css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // comma separator
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `txt,bmp,css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // semicolon separator
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `txt;bmp;css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // combined separator
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `txt; bmp ,; css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // match full extension
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `tx, mp, s`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  // RegExp rule with flag
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `/(TXT|BMP|CSS)/i`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // RegExp rule with no flag
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `/(TXT|BMP|CSS)/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);

  // RegExp rule
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `/(?!py).+/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);

  // match full extension
  var options = {
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": `/tx/`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(Object.keys(zip.files).length === 1);
}

// Check urlFilter syntax
//
// capture.downLink.urlFilter
async function test_capture_downLink3() {
  // a rule each line
  // plain text rule
  // match original URL
  // rule and URL have hash stripped before comparison
  var options = {
    "capture.downLink.mode": "header",
    "capture.downLink.extFilter": `txt, bmp, css`,
    // 1. should match
    // 2. should match (hash in rule and URL are stripped)
    // 3. should match (hash in rule is stripped)
    "capture.downLink.urlFilter": `\
${localhost}/capture_downLink/file.bmp
${localhost}/capture_downLink/file.css#whatever
${localhost}/capture_downLink/mime.py#foo`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file2.txt"]);
  assert(Object.keys(zip.files).length === 3);

  // plain text rule must match full URL
  var options = {
    "capture.downLink.mode": "header",
    "capture.downLink.extFilter": `txt, bmp, css`,
    // 1. should not match
    // 2. should match (hash in URL is stripped)
    "capture.downLink.urlFilter": `\
capture_downLink/mime.py
${localhost}/capture_downLink/file.css`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file2.txt"]);
  assert(zip.files["file3.txt"]);
  assert(zip.files["file.bmp"]);
  assert(Object.keys(zip.files).length === 5);

  // RegExp rule
  // match original URL
  // match partial URL
  // URL has hash stripped before comparison but rule is not
  var options = {
    "capture.downLink.mode": "header",
    "capture.downLink.extFilter": `txt, bmp, css`,
    // 1. should match
    // 2. should not match (hash stripped in URL but not in rule)
    "capture.downLink.urlFilter": `\
/[/][^/]+[.]PY$/i
/#.+$/i`,
  };

  var blob = await captureHeadless({
    url: `${localhost}/capture_downLink/basic.html`,
    options: Object.assign({}, baseOptions, options),
  });

  var zip = await new JSZip().loadAsync(blob);
  assert(zip.files["file.txt"]);
  assert(zip.files["file.bmp"]);
  assert(zip.files["file.css"]);
  assert(Object.keys(zip.files).length === 4);
}

// Check if the URL in a meta refresh is rewritten correctly
//
// capturer.captureDocument
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
  assert(mrs[1].getAttribute('content') === `30;url=#`);
  assert(mrs[2].getAttribute('content') === `30;url=#123`);
  assert(mrs[3].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed.html?id=123`);
  assert(mrs[4].getAttribute('content') === `30`);
  assert(mrs[5].getAttribute('content') === `30;url=#`);
  assert(mrs[6].getAttribute('content') === `30;url=#123`);
  assert(mrs[7].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed.html?id=123`);
  assert(mrs[8].getAttribute('content') === `20;url=${localhost}/capture_metaRefresh/referred.html`);
  assert(mrs[9].getAttribute('content') === `20;url=${localhost}/capture_metaRefresh/referred.html#`);
  assert(mrs[10].getAttribute('content') === `20;url=${localhost}/capture_metaRefresh/referred.html#123`);
  assert(mrs[11].getAttribute('content') === `20;url=${localhost}/capture_metaRefresh/referred.html?id=123`);
  assert(mrs[12].getAttribute('content') === `15;url=http://example.com/`);
  assert(mrs[13].getAttribute('content') === `15;url=http://example.com/#`);
  assert(mrs[14].getAttribute('content') === `15;url=http://example.com/#123`);
  assert(mrs[15].getAttribute('content') === `15;url=http://example.com/?id=123`);
}

// Check local selection
// a meta refresh URL pointing to a not captured part of self page should be resolved to original page
//
// capturer.captureDocument
async function test_capture_metaRefresh2() {
  /* refresh link target not captured */
  var blob = await capture({
    url: `${localhost}/capture_metaRefresh/delayed21.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `30`);
  assert(mrs[1].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed21.html#123`);
  assert(mrs[2].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed21.html?id=123`);
  assert(mrs[3].getAttribute('content') === `30`);
  assert(mrs[4].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed21.html#123`);
  assert(mrs[5].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed21.html?id=123`);
  assert(mrs[6].getAttribute('content') === `20;url=${localhost}/capture_metaRefresh/referred.html`);
  assert(mrs[7].getAttribute('content') === `15;url=http://example.com/`);

  /* refresh link target captured */
  var blob = await capture({
    url: `${localhost}/capture_metaRefresh/delayed22.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `30`);
  assert(mrs[1].getAttribute('content') === `30;url=#123`);
  assert(mrs[2].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed22.html?id=123`);
  assert(mrs[3].getAttribute('content') === `30`);
  assert(mrs[4].getAttribute('content') === `30;url=#123`);
  assert(mrs[5].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed22.html?id=123`);
  assert(mrs[6].getAttribute('content') === `20;url=${localhost}/capture_metaRefresh/referred.html`);
  assert(mrs[7].getAttribute('content') === `15;url=http://example.com/`);
}

// Check when base is set to another page
//
// capturer.captureDocument
async function test_capture_metaRefresh3() {
  var blob = await capture({
    url: `${localhost}/capture_metaRefresh/delayed3.html`,
    options: baseOptions,
  });

  var zip = await new JSZip().loadAsync(blob);

  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
  assert(mrs[0].getAttribute('content') === `30`);
  assert(mrs[1].getAttribute('content') === `30;url=#`);
  assert(mrs[2].getAttribute('content') === `30;url=#123`);
  assert(mrs[3].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed3.html?id=123`);
  assert(mrs[4].getAttribute('content') === `30`);
  assert(mrs[5].getAttribute('content') === `30;url=#`);
  assert(mrs[6].getAttribute('content') === `30;url=#123`);
  assert(mrs[7].getAttribute('content') === `30;url=${localhost}/capture_metaRefresh/delayed3.html?id=123`);
  assert(mrs[8].getAttribute('content') === `20;url=${localhost}/capture_metaRefresh/referred.html`);
  assert(mrs[9].getAttribute('content') === `20;url=${localhost}/capture_metaRefresh/subdir/referred.html`);
  assert(mrs[10].getAttribute('content') === `15;url=http://example.com/`);
}

// Check if option works
//
// capture.removeIntegrity
async function test_capture_integrity() {
  /* +capture.removeIntegrity */
  var options = {
    "capture.removeIntegrity": true,
  };
  var blob = await capture({
    url: `${localhost}/capture_integrity/integrity.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var link = doc.querySelector('link');
  assert(!link.hasAttribute('integrity'));
  assert(!link.hasAttribute('crossorigin'));
  var script = doc.querySelector('script');
  assert(!script.hasAttribute('integrity'));
  assert(!script.hasAttribute('crossorigin'));

  /* -capture.removeIntegrity */
  var options = {
    "capture.removeIntegrity": false,
  };
  var blob = await capture({
    url: `${localhost}/capture_integrity/integrity.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);

  var link = doc.querySelector('link');
  assert(link.hasAttribute('integrity'));
  assert(link.hasAttribute('crossorigin'));
  var script = doc.querySelector('script');
  assert(script.hasAttribute('integrity'));
  assert(script.hasAttribute('crossorigin'));
}

// Check if option works
//
// capture.recordDocumentMeta
// capturer.captureDocument
// capturer.captureFile
// capturer.captureBookmark
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
  assert(/^\d{17}$/.test(html.getAttribute('data-scrapbook-create')));

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
  assert(/^\d{17}$/.test(html.getAttribute('data-scrapbook-create')));
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
  assert(/^\d{17}$/.test(html.getAttribute('data-scrapbook-create')));
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

// Check if option works
//
// capture.recordRemovedNode
// capturer.captureDocument
async function test_capture_record_nodes() {
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
    "capture.base": "remove",
  };

  /* +capture.recordRemovedNode */
  options["capture.recordRemovedNode"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/nodes.html`,
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
    `<!--scrapbook-orig-node-${timeId}--<base[^>]*?>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<link[^>]*? rel="shortcut icon"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<link[^>]*? rel="stylesheet"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<script[^>]*?>[\\s\\S]*?</script>-->`
  ).test(head.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<img[^>]*? src=[^>]*?>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<img[^>]*? srcset=[^>]*?>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<picture>[\\s\\S]*?</picture>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<input[^>]*? type="image"[^>]*?>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<canvas[^>]*?>[\\s\\S]*?</canvas>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<audio[^>]*?>[\\s\\S]*?</audio>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<video[^>]*?>[\\s\\S]*?</video>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<video[^>]*?>[\\s\\S]*?</video>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<embed[^>]*?>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<object[^>]*?>[\\s\\S]*?</object>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<applet[^>]*?>[\\s\\S]*?</applet>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<iframe[^>]*?>[\\s\\S]*?</iframe>-->`
  ).test(body.innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<noscript[^>]*?>[\\s\\S]*?</noscript>-->`
  ).test(body.innerHTML));

  /* -capture.recordRemovedNode */  
  options["capture.recordRemovedNode"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/nodes.html`,
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
    `<!--scrapbook-orig-node-${timeId}--<base[^>]*?>-->`
  ).test(head.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<link[^>]*? rel="shortcut icon"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<link[^>]*? rel="stylesheet"[^>]*?>-->`
  ).test(head.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<script[^>]*?>[\\s\\S]*?</script>-->`
  ).test(head.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<img[^>]*? src=[^>]*?>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<img[^>]*? srcset=[^>]*?>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<picture>[\\s\\S]*?</picture>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<input[^>]*? type="image"[^>]*?>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<canvas[^>]*?>[\\s\\S]*?</canvas>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<audio[^>]*?>[\\s\\S]*?</audio>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<video[^>]*?>[\\s\\S]*?</video>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<video[^>]*?>[\\s\\S]*?</video>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<embed[^>]*?>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<object[^>]*?>[\\s\\S]*?</object>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<applet[^>]*?>[\\s\\S]*?</applet>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<iframe[^>]*?>[\\s\\S]*?</iframe>-->`
  ).test(body.innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<noscript[^>]*?>[\\s\\S]*?</noscript>-->`
  ).test(body.innerHTML));
}

// Check handling of removal of source nodes in picture, audio, and video
// The removed source nodes should be recorded when 
// either recordRemovedNode or recordSourceUri is set.
//
// capture.recordRemovedNode
// capture.recordSourceUri
// capturer.captureDocument
async function test_capture_record_nodes2() {
  var options = {
    "capture.image": "save-current",
    "capture.audio": "save-current",
    "capture.video": "save-current",
  };

  /* +capture.recordRemovedNode */
  options["capture.recordRemovedNode"] = true;
  options["capture.recordSourceUri"] = false;

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
    `<!--scrapbook-orig-node-${timeId}--<source[^>]*?>-->`
  ).test(doc.querySelector('picture').innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<source[^>]*?>-->`
  ).test(doc.querySelector('audio').innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<source[^>]*?>-->`
  ).test(doc.querySelector('video').innerHTML));

  /* +capture.recordSourceUri */
  options["capture.recordRemovedNode"] = false;
  options["capture.recordSourceUri"] = true;

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
    `<!--scrapbook-orig-node-${timeId}--<source[^>]*?>-->`
  ).test(doc.querySelector('picture').innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<source[^>]*?>-->`
  ).test(doc.querySelector('audio').innerHTML));

  assert(new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<source[^>]*?>-->`
  ).test(doc.querySelector('video').innerHTML));

  /* -capture.recordSourceUri */
  options["capture.recordRemovedNode"] = false;
  options["capture.recordSourceUri"] = false;

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
    `<!--scrapbook-orig-node-${timeId}--<source[^>]*?>-->`
  ).test(doc.querySelector('picture').innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<source[^>]*?>-->`
  ).test(doc.querySelector('audio').innerHTML));

  assert(!new RegExp(
    `<!--scrapbook-orig-node-${timeId}--<source[^>]*?>-->`
  ).test(doc.querySelector('video').innerHTML));
}

// Check if option works
//
// capture.recordRewrittenAttr
// capturer.captureDocument
async function test_capture_record_attrs() {
  var options = {
    "capture.frame": "save",
    "capture.styleInline": "blank",
    "capture.rewriteCss": "url",
    "capture.script": "blank",
    "capture.formStatus": "keep",
    "capture.removeIntegrity": true,
  };

  /* +capture.recordRewrittenAttr */
  options["capture.recordRewrittenAttr"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('meta').getAttribute(`data-scrapbook-orig-attr-charset-${timeId}`) === `Big5`);
  assert(doc.querySelector('meta[content]').getAttribute(`data-scrapbook-orig-attr-content-${timeId}`) === `text/html; charset=Big5`);
  assert(doc.querySelector('script').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`) === `sha256-FDJ1FZczv9rCdgEzfJCWGhlAqb9kOUFZoNu99URFDlg=`);
  assert(doc.querySelector('script').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`) === `anonymous`);
  assert(doc.querySelector('body').getAttribute(`data-scrapbook-orig-attr-onload-${timeId}`) === `console.log('load');`);
  assert(doc.querySelector('div').getAttribute(`data-scrapbook-orig-attr-style-${timeId}`) === `background-color: green;`);
  assert(doc.querySelector('iframe').getAttribute(`data-scrapbook-orig-attr-srcdoc-${timeId}`) === `frame page content`);
  assert(doc.querySelector('a').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `javascript:console.log('a');`);
  assert(doc.querySelector('input[type="checkbox"]').getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`) === ``);
  assert(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`) === ``);
  assert(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`) === ``);
  assert(doc.querySelector('select option').getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`) === ``);

  /* -capture.recordRewrittenAttr */
  options["capture.recordRewrittenAttr"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/attrs.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(!doc.querySelector('meta').hasAttribute(`data-scrapbook-orig-attr-charset-${timeId}`));
  assert(!doc.querySelector('meta[content]').hasAttribute(`data-scrapbook-orig-attr-content-${timeId}`));
  assert(!doc.querySelector('script').hasAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`));
  assert(!doc.querySelector('script').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
  assert(!doc.querySelector('body').hasAttribute(`data-scrapbook-orig-attr-onload-${timeId}`));
  assert(!doc.querySelector('div').hasAttribute(`data-scrapbook-orig-attr-style-${timeId}`));
  assert(!doc.querySelector('iframe').hasAttribute(`data-scrapbook-orig-attr-srcdoc-${timeId}`));
  assert(!doc.querySelector('a').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('input[type="checkbox"]').hasAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`));
  assert(!doc.querySelector('input[type="text"]').hasAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`));
  assert(!doc.querySelector('textarea').hasAttribute(`data-scrapbook-orig-textcontent-${timeId}`));
  assert(!doc.querySelector('select option').hasAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`));
}

// Check if option works: save cases
//
// capture.recordSourceUri
// capturer.captureDocument
// capturer.processCssText
async function test_capture_record_urls() {
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
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": "txt",
    "capture.downLink.urlFilter": "",
  };

  /* +capture.recordSourceUri */
  options["capture.recordSourceUri"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/urls.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(!doc.querySelector('meta[property]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`)); // no record
  assert(doc.querySelector('link[rel="preload"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `${localhost}/capture_record/null.css`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `${localhost}/capture_record/null.css`);
  assert(doc.querySelector('script').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.js`);
  assert(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('img[srcset]').getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `${localhost}/capture_record/null.bmp 1x, ${localhost}/capture_record/null.bmp 2x`);
  assert(doc.querySelector('picture source').getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('input[type="image"]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('table').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('table tr').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('table tr th').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('table tr td').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.mp3`);
  assert(doc.querySelector('audio source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.ogg`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.mp4`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-poster-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('video source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.webm`);
  assert(doc.querySelector('iframe').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.html`);
  assert(doc.querySelector('embed').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.swf`);
  assert(doc.querySelector('object').getAttribute(`data-scrapbook-orig-attr-data-${timeId}`) === `${localhost}/capture_record/null.swf`);
  assert(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-code-${timeId}`) === `${localhost}/capture_record/null.class`);
  assert(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-archive-${timeId}`) === `${localhost}/capture_record/null.jar`);
  assert(doc.querySelector('a').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `${localhost}/capture_record/null.txt`);

  // CSS
  assert(doc.querySelector('style').textContent.trim() === `@import /*scrapbook-orig-url="${localhost}/capture_record/null.css"*/url("null.css");
@font-face { font-family: myFont; src: /*scrapbook-orig-url="${localhost}/capture_record/null.woff"*/url("null.woff"); }
p { background-image: /*scrapbook-orig-url="${localhost}/capture_record/null.bmp"*/url("null.bmp"); }`);
  assert(doc.querySelector('div').getAttribute('style') === `background: /*scrapbook-orig-url="${localhost}/capture_record/null.bmp"*/url("null.bmp");`);

  /* -capture.recordSourceUri */
  options["capture.recordSourceUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/urls.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(!doc.querySelector('meta[property]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`)); // no record
  assert(!doc.querySelector('link[rel="preload"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('link[rel~="icon"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('link[rel="stylesheet"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('script').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('img').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
  assert(!doc.querySelector('img[srcset]').hasAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`));
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
  assert(!doc.querySelector('a').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));

  // CSS
  assert(doc.querySelector('style').textContent.trim() === `@import url("null.css");
@font-face { font-family: myFont; src: url("null.woff"); }
p { background-image: url("null.bmp"); }`);
  assert(doc.querySelector('div').getAttribute('style') === `background: url("null.bmp");`);
}

// Check if option works: blank cases
// (save styles to save CSS and check image background and font)
//
// capture.recordSourceUri
// capturer.captureDocument
// capturer.processCssText
async function test_capture_record_urls2() {
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
  };

  /* +capture.recordSourceUri */
  options["capture.recordSourceUri"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/urls.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(!doc.querySelector('meta[property]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`)); // no record
  assert(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('script').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.js`);
  assert(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `${localhost}/capture_record/null.bmp 1x, ${localhost}/capture_record/null.bmp 2x`);
  assert(doc.querySelector('picture source').getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('input[type="image"]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('table').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('table tr').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('table tr th').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('table tr td').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.mp3`);
  assert(doc.querySelector('audio source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.ogg`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.mp4`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-poster-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('video source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.webm`);
  assert(doc.querySelector('iframe').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.html`);
  assert(doc.querySelector('embed').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.swf`);
  assert(doc.querySelector('object').getAttribute(`data-scrapbook-orig-attr-data-${timeId}`) === `${localhost}/capture_record/null.swf`);
  assert(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-code-${timeId}`) === `${localhost}/capture_record/null.class`);
  assert(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-archive-${timeId}`) === `${localhost}/capture_record/null.jar`);

  // CSS
  assert(doc.querySelector('style').textContent.trim() === `@import /*scrapbook-orig-url="${localhost}/capture_record/null.css"*/url("null.css");
@font-face { font-family: myFont; src: /*scrapbook-orig-url="${localhost}/capture_record/null.woff"*/url(""); }
p { background-image: /*scrapbook-orig-url="${localhost}/capture_record/null.bmp"*/url(""); }`);
  assert(doc.querySelector('div').getAttribute('style') === `background: /*scrapbook-orig-url="${localhost}/capture_record/null.bmp"*/url("");`);

  /* -capture.recordSourceUri */
  options["capture.recordSourceUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/urls.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(!doc.querySelector('meta[property]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`)); // no record
  assert(!doc.querySelector('link[rel~="icon"]').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`));
  assert(!doc.querySelector('script').hasAttribute(`data-scrapbook-orig-attr-src-${timeId}`));
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

// Check if option works: save-current cases
// (and blank style)
//
// capture.recordSourceUri
// capturer.captureDocument
// capturer.processCssText
async function test_capture_record_urls3() {
  var options = {
    "capture.image": "save-current",
    "capture.audio": "save-current",
    "capture.video": "save-current",
    "capture.style": "blank",
  };

  /* +capture.recordSourceUri */
  options["capture.recordSourceUri"] = true;

  var blob = await capture({
    url: `${localhost}/capture_record/urls.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  // attr
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `${localhost}/capture_record/null.css`);
  assert(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelectorAll('img')[1].getAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`) === ``);
  assert(doc.querySelectorAll('img')[1].getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`) === `${localhost}/capture_record/null.bmp 1x, ${localhost}/capture_record/null.bmp 2x`);
  assert(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.mp3`);
  assert(doc.querySelectorAll('audio')[1].getAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`) === ``);
  assert(!doc.querySelectorAll('audio')[1].getAttribute(`data-scrapbook-orig-attr-src-${timeId}`)); // double record bug
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`) === `${localhost}/capture_record/null.mp4`);
  assert(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-poster-${timeId}`) === `${localhost}/capture_record/null.bmp`);
  assert(doc.querySelectorAll('video')[1].getAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`) === ``);
  assert(!doc.querySelectorAll('video')[1].getAttribute(`data-scrapbook-orig-attr-src-${timeId}`)); // double record bug

  /* +capture.recordSourceUri */
  options["capture.recordSourceUri"] = false;

  var blob = await capture({
    url: `${localhost}/capture_record/urls.html`,
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

// Check if option works: for base
//
// capture.recordSourceUri
// capturer.captureDocument
// capturer.processCssText
async function test_capture_record_urls4() {
  var options = {
    "capture.recordSourceUri": true,
  };

  /* save */
  options["capture.base"] = "save";

  var blob = await capture({
    url: `${localhost}/capture_record/urls2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(!doc.querySelector('base').hasAttribute(`data-scrapbook-orig-attr-href-${timeId}`)); // no record

  /* blank */
  options["capture.base"] = "blank";

  var blob = await capture({
    url: `${localhost}/capture_record/urls2.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('base').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`) === `${localhost}/capture_record/null.html`);
}

// Check if option works: for normal URL
//
// capture.recordErrorUri
// capturer.captureDocument
// capturer.downloadFile
// capturer.captureUrl
// capturer.captureBookmark
async function test_capture_record_errorUrls() {
  var options = {
    "capture.image": "save",
    "capture.imageBackground": "save",
    "capture.favicon": "save",
    "capture.frame": "save",
    "capture.font": "save",
    "capture.style": "save",
    "capture.rewriteCss": "url",
    "capture.script": "save",
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": "txt",
    "capture.downLink.urlFilter": "",
  };

  /* +capture.recordErrorUri */
  options["capture.recordErrorUri"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/error-urls.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('style').textContent.trim() === `@import url("urn:scrapbook:download:error:${localhost}/capture_record/nonexist.css");
@font-face { font-family: myFont; src: url("urn:scrapbook:download:error:${localhost}/capture_record/nonexist.woff"); }
p { background-image: url("urn:scrapbook:download:error:${localhost}/capture_record/nonexist.bmp"); }`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('href') === `urn:scrapbook:download:error:${localhost}/capture_record/nonexist.bmp`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === `urn:scrapbook:download:error:${localhost}/capture_record/nonexist.css`);
  assert(doc.querySelector('script').getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_record/nonexist.js`);
  assert(doc.querySelector('img').getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_record/nonexist.bmp`);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `urn:scrapbook:download:error:${localhost}/capture_record/nonexist.bmp 1x, urn:scrapbook:download:error:${localhost}/capture_record/nonexist.bmp 2x`);
  assert(doc.querySelector('iframe').getAttribute('src') === `urn:scrapbook:download:error:${localhost}/capture_record/nonexist.html`);
  assert(doc.querySelector('a').getAttribute('href') === `urn:scrapbook:download:error:${localhost}/capture_record/nonexist.txt`);
  assert(doc.querySelector('a[name]').getAttribute('href') === `${localhost}/capture_record/nonexist.css`); // no downLink, no error

  /* -capture.recordErrorUri */
  options["capture.recordErrorUri"] = false;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/error-urls.html`,
    options: Object.assign({}, baseOptions, options),
  });
  var zip = await new JSZip().loadAsync(blob);
  var indexFile = zip.file('index.html');
  var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
  var doc = await readFileAsDocument(indexBlob);
  var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

  assert(doc.querySelector('style').textContent.trim() === `@import url("${localhost}/capture_record/nonexist.css");
@font-face { font-family: myFont; src: url("${localhost}/capture_record/nonexist.woff"); }
p { background-image: url("${localhost}/capture_record/nonexist.bmp"); }`);
  assert(doc.querySelector('link[rel~="icon"]').getAttribute('href') === `${localhost}/capture_record/nonexist.bmp`);
  assert(doc.querySelector('link[rel="stylesheet"]').getAttribute('href') === `${localhost}/capture_record/nonexist.css`);
  assert(doc.querySelector('script').getAttribute('src') === `${localhost}/capture_record/nonexist.js`);
  assert(doc.querySelector('img').getAttribute('src') === `${localhost}/capture_record/nonexist.bmp`);
  assert(doc.querySelector('img[srcset]').getAttribute('srcset') === `${localhost}/capture_record/nonexist.bmp 1x, ${localhost}/capture_record/nonexist.bmp 2x`);
  assert(doc.querySelector('iframe').getAttribute('src') === `${localhost}/capture_record/nonexist.html`);
  assert(doc.querySelector('a').getAttribute('href') === `${localhost}/capture_record/nonexist.txt`);
  assert(doc.querySelector('a[name]').getAttribute('href') === `${localhost}/capture_record/nonexist.css`);
}

// Test for "" URL:
// Don't generate error URL for non-absolute URLs.
//
// capture.recordErrorUri
// capturer.captureDocument
// capturer.downloadFile
// capturer.captureUrl
// capturer.captureBookmark
async function test_capture_record_errorUrls2() {
  var options = {
    "capture.image": "save",
    "capture.imageBackground": "save",
    "capture.favicon": "save",
    "capture.frame": "save",
    "capture.font": "save",
    "capture.style": "save",
    "capture.rewriteCss": "url",
    "capture.script": "save",
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": "txt",
    "capture.downLink.urlFilter": "",
  };

  /* +capture.recordErrorUri */
  options["capture.recordErrorUri"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/error-urls2.html`,
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

// Test for hash URL:
// Don't generate error URL for non-absolute URLs.
//
// capture.recordErrorUri
// capturer.captureDocument
// capturer.downloadFile
// capturer.captureUrl
// capturer.captureBookmark
async function test_capture_record_errorUrls3() {
  var options = {
    "capture.image": "save",
    "capture.imageBackground": "save",
    "capture.favicon": "save",
    "capture.frame": "save",
    "capture.font": "save",
    "capture.style": "save",
    "capture.rewriteCss": "url",
    "capture.script": "save",
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": "txt",
    "capture.downLink.urlFilter": "",
  };

  /* +capture.recordErrorUri */
  options["capture.recordErrorUri"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/error-urls3.html`,
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

// Test for non-resolvable URL:
// Don't generate error URL for non-absolute URLs.
//
// capture.recordErrorUri
// capturer.captureDocument
// capturer.downloadFile
// capturer.captureUrl
// capturer.captureBookmark
async function test_capture_record_errorUrls4() {
  var options = {
    "capture.image": "save",
    "capture.imageBackground": "save",
    "capture.favicon": "save",
    "capture.frame": "save",
    "capture.font": "save",
    "capture.style": "save",
    "capture.rewriteCss": "url",
    "capture.script": "save",
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": "txt",
    "capture.downLink.urlFilter": "",
  };

  /* +capture.recordErrorUri */
  options["capture.recordErrorUri"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/error-urls4.html`,
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

// Test for other protocol URL:
// Don't generate error URL if the protocol is not http, https, or file
//
// capture.recordErrorUri
// capturer.captureDocument
// capturer.downloadFile
// capturer.captureUrl
// capturer.captureBookmark
async function test_capture_record_errorUrls5() {
  var options = {
    "capture.image": "save",
    "capture.imageBackground": "save",
    "capture.favicon": "save",
    "capture.frame": "save",
    "capture.font": "save",
    "capture.style": "save",
    "capture.rewriteCss": "url",
    "capture.script": "save",
    "capture.downLink.mode": "url",
    "capture.downLink.extFilter": "txt",
    "capture.downLink.urlFilter": "",
  };

  /* +capture.recordErrorUri */
  options["capture.recordErrorUri"] = true;

  var blob = await captureHeadless({
    url: `${localhost}/capture_record/error-urls5.html`,
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

async function runTests() {
  await test(test_capture_html);
  await test(test_capture_singleHtmlJs);
  await test(test_capture_metaCharset);
  await test(test_capture_xhtml);
  await test(test_capture_file);
  await test(test_capture_file_charset);
  await test(test_capture_header);
  await test(test_capture_filename);
  await test(test_capture_saveAsciiFilename);
  await test(test_capture_saveFileAsHtml);
  await test(test_capture_dataUri);
  await test(test_capture_dataUri_resolve);
  await test(test_capture_dataUri_resolve2);
  await test(test_capture_selection);
  await test(test_capture_headless);
  await test(test_capture_bookmark);
  await test(test_capture_frame);
  await test(test_capture_frame2);
  await test(test_capture_frame3);
  await test(test_capture_frame_headless);
  await test(test_capture_frame_headless2);
  await test(test_capture_frame_headless3);
  await test(test_capture_frame_circular);
  await test(test_capture_frame_circular2);
  await test(test_capture_frame_dataUri);
  await test(test_capture_css_style);
  await test(test_capture_css_styleInline);
  await test(test_capture_css_rewriteCss);
  await test(test_capture_css_syntax);
  await test(test_capture_css_charset);
  await test(test_capture_css_rewrite);
  await test(test_capture_css_rewrite2);
  await test(test_capture_css_rewrite3);
  await test(test_capture_css_rewrite4);
  await test(test_capture_css_circular);
  await test(test_capture_css_circular2);
  await test(test_capture_image);
  await test(test_capture_imageBackground);
  await test(test_capture_imageBackgroundUsed);
  await test(test_capture_favicon);
  await test(test_capture_canvas);
  await test(test_capture_audio);
  await test(test_capture_video);
  await test(test_capture_font);
  await test(test_capture_script);
  await test(test_capture_noscript);
  await test(test_capture_embed);
  await test(test_capture_object);
  await test(test_capture_applet);
  await test(test_capture_base);
  await test(test_capture_formStatus);
  await test(test_capture_rewrite);
  await test(test_capture_rewrite2);
  await test(test_capture_anchor);
  await test(test_capture_anchor2);
  await test(test_capture_anchor3);
  await test(test_capture_downLink);
  await test(test_capture_downLink2);
  await test(test_capture_downLink3);
  await test(test_capture_metaRefresh);
  await test(test_capture_metaRefresh2);
  await test(test_capture_metaRefresh3);
  await test(test_capture_integrity);
  await test(test_capture_record_meta);
  await test(test_capture_record_nodes);
  await test(test_capture_record_nodes2);
  await test(test_capture_record_attrs);
  await test(test_capture_record_urls);
  await test(test_capture_record_urls2);
  await test(test_capture_record_urls3);
  await test(test_capture_record_urls4);
  await test(test_capture_record_errorUrls);
  await test(test_capture_record_errorUrls2);
  await test(test_capture_record_errorUrls3);
  await test(test_capture_record_errorUrls4);
  await test(test_capture_record_errorUrls5);
}

/**
 * Main flow
 */
async function main() {
  await init();
  await runTests();
  await showTestResult();
}

main();
