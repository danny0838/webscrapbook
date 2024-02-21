'use strict';

/******************************************************************************
 * Configs
 *****************************************************************************/

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


/******************************************************************************
 * Main
 *****************************************************************************/

async function runTests(prefixes = ['test_']) {
  const tests = Object.keys(window).filter(x => prefixes.some(p => x.startsWith(p)));
  for (const t of tests) {
    await test(window[t]);
  }
}

async function runAutomatedTests() {
  await runTests(config["automated_tests"]);
}

async function runManualTests() {
  await runTests(config["manual_tests"]);
}

async function main() {
  async function loadScript(src) {
    const p = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return p;
  }

  const mode = new URL(location.href).searchParams.get('m');

  let time = Date.now();
  await init();
  await loadScript('./test_auto.js');
  await loadScript('./test_manual.js');

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
