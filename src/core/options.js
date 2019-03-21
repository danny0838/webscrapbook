/********************************************************************
 *
 * Script for options.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

const OPTION_PREFIX = "opt_";

const defaultOptions = JSON.parse(JSON.stringify(scrapbook.options));

async function initDefaultOptions() {
  const options = await scrapbook.loadOptions();
  for (const id in options) {
    setOptionToDocument(id, options[id]);
  }
}

function getOptionFromDocument(id) {
  const elem = document.getElementById(OPTION_PREFIX + id);
  if (!elem) { return; }

  if (elem.matches('input[type="checkbox"]')) {
    return elem.checked;
  } else {
    return elem.value;
  }
}

function setOptionToDocument(id, value) {
  const elem = document.getElementById(OPTION_PREFIX + id);
  if (!elem) { return; }

  if (elem.matches('input[type="checkbox"]')) {
    elem.checked = !!value;
  } else {
    elem.value = value;

    // If the given value is not included in the options,
    // generate a hidden option element for it, so that
    // importing hacking value is allowed.
    if (elem.matches('select') && elem.value != value) {
      const c = document.createElement('option');
      c.style.display = 'none';
      c.value = c.textContent = value;
      elem.appendChild(c);
      elem.value = value;
    }
  }
}

function resetOptions(file) {
  for (const id in defaultOptions) {
    setOptionToDocument(id, defaultOptions[id]);
  }
}

function exportOptions() {
  const blob = new Blob([JSON.stringify(scrapbook.options, null, 2)], {type: "application/json"});
  const filename = `webscrapbook.options.${scrapbook.dateToId().slice(0, 8)}.json`;

  if (scrapbook.userAgent.is('gecko')) {
    // Firefox has a bug that the screen turns unresponsive
    // when an addon page is redirected to a blob URL.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1420419
    //
    // Workaround by creating the anchor in an iframe.
    const iDoc = document.getElementById('downloader').contentDocument;
    const a = iDoc.createElement('a');
    a.download = filename;
    a.href = URL.createObjectURL(blob);
    iDoc.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const elem = document.createElement('a');
  elem.download = filename;
  elem.href = URL.createObjectURL(blob);
  document.body.appendChild(elem);
  elem.click();
  elem.remove();
}

async function importOptions(file) {
  document.getElementById("import-input").value = null;

  try {
    const data = JSON.parse(await scrapbook.readFileAsText(file));
    const options = Object.assign(scrapbook.options, data);
    scrapbook.options = options;
    await scrapbook.saveOptions();
    for (const id in options) {
      setOptionToDocument(id, options[id]);
    }
    alert(scrapbook.lang("OptionsImportSuccess"));
  } catch (ex) {
    alert(scrapbook.lang("ErrorImportOptions", [ex.message]));
  }
}

async function closeWindow() {
  const tab = await browser.tabs.getCurrent();
  if (!tab) {
    // options.html is a prompt diaglog
    window.close();
  } else if (tab.url.startsWith(browser.runtime.getURL(""))) {
    // options.html is in a tab (or Firefox Android)
    // close the tab
    return await browser.tabs.remove(tab.id);
  } else {
    // options.html is embedded in about:addon in Firefox
    // do not close the tab
  }
}

function verifyDownLinkFilters(rules) {
  const checkRule = (rules) => {
    rules.split(/(?:\n|\r\n?)/).forEach(function (srcLine, index) {
      if (srcLine.charAt(0) === "#") { return; }

      let line = srcLine.trim();
      if (line === "") { return; }
      if (!/^\/(.*)\/([a-z]*)$/.test(line)) { return; }

      try {
        new RegExp("^(?:" + line + ")$");
      } catch (ex) {
        line = scrapbook.lang("OptionCaptureDownLinkFilterErrorLine", [index + 1, srcLine]);
        errors.push(line);
      }
    });
  };

  let errors;

  errors = [];
  checkRule(document.getElementById("opt_capture.downLink.extFilter").value);
  if (errors.length) {
    if (confirm(scrapbook.lang("OptionCaptureDownLinkExtFilterError", [errors.join('\n\n')]))) {
      return false;
    }
  }

  errors = [];
  checkRule(document.getElementById("opt_capture.downLink.urlFilter").value);
  if (errors.length) {
    if (confirm(scrapbook.lang("OptionCaptureDownLinkUrlFilterError", [errors.join('\n\n')]))) {
      return false;
    }
  }

  return true;
}

function refreshForm() {
  renewCaptureSaveToDetails(); 
  renewCaptureDownLinkDetails(); 
}

function renewCaptureSaveToDetails() {
  const mode = document.getElementById("opt_capture.saveTo").value;

  document.getElementById('captureSaveToFolderDetails').hidden = mode !== 'folder';
}

function verifySavePath(event) {
  const elem = event.target;
  if (elem.value) {
    // make sure it's a valid path for browser.downloads.download
    elem.value = elem.value.split(/[\\\/]/).map(x => scrapbook.validateFilename(x)).join('/');
  } else {
    // reset value to placeholder
    elem.value = elem.placeholder;
  }
}

function renewCaptureDownLinkDetails() {
  const mode = document.getElementById("opt_capture.downLink.mode").value;
  const elem = document.getElementById('captureDownLinkDetails');
  elem.hidden = mode === 'none';
}

window.addEventListener("DOMContentLoaded", async (event) => {
  // load languages
  scrapbook.loadLanguages(document);
  document.getElementById("optionServerUrlTooltip").setAttribute('data-tooltip', scrapbook.lang('OptionServerUrlTooltip', [scrapbook.backendMinVersion]));

  // load default options
  await initDefaultOptions();
  refreshForm();

  // event handlers
  document.getElementById("opt_capture.saveTo").addEventListener("change", renewCaptureSaveToDetails);

  document.getElementById("opt_capture.saveFolder").addEventListener("change", verifySavePath);

  document.getElementById("opt_capture.saveFilename").addEventListener("change", verifySavePath);

  document.getElementById("opt_capture.downLink.mode").addEventListener("change", renewCaptureDownLinkDetails);

  document.getElementById("options").addEventListener("submit", async (event) => {
    event.preventDefault();

    // verify the form
    if (!verifyDownLinkFilters()) {
      return;
    }

    // save options
    for (const id in scrapbook.options) {
      // Overwrite only keys with a defined value so that
      // keys not listed in the options page are not nullified.
      // In Chromium, storageArea.set({key: undefined}) does not store to key.
      // In Firefox, storageArea.set({key: undefined}) stores null to key.
      const value = getOptionFromDocument(id);
      if (typeof value !== "undefined") {
        scrapbook.options[id] = value;
      }
    }
    await scrapbook.saveOptions();
    return closeWindow();
  });

  document.getElementById("reset").addEventListener("click", (event) => {
    event.preventDefault();
    resetOptions();
    refreshForm();
  });

  document.getElementById("export").addEventListener("click", (event) => {
    event.preventDefault();
    exportOptions();
  });

  document.getElementById("import").addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("import-input").click();
  });

  document.getElementById("import-input").addEventListener("change", async (event) => {
    event.preventDefault();
    const file = event.target.files[0];
    await importOptions(file);
    refreshForm();
  });
});
