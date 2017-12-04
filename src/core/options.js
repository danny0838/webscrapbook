/********************************************************************
 *
 * Script for options.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

const OPTION_PREFIX = "opt_";

const defaultOptions = JSON.parse(JSON.stringify(scrapbook.options));

function initDefaultOptions() {
  scrapbook.loadOptions().then((options) => {
    for (const id in options) {
      setOptionToDocument(id, options[id]);
    }
  });
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

  if (scrapbook.isGecko) {
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

function importOptions(file) {
  document.getElementById("import-input").value = null;

  scrapbook.readFileAsText(file).then((text) => {
    const data = JSON.parse(text);
    const options = Object.assign(scrapbook.options, data);
    scrapbook.options = options;
    return scrapbook.saveOptions().then(() => {
      for (const id in options) {
        setOptionToDocument(id, options[id]);
      }
    });
  }).then(() => {
    alert(scrapbook.lang("OptionsImportSuccess"));
  }).catch((ex) => {
    alert(scrapbook.lang("ErrorImportOptions", [ex.message]));
  });
}

function checkRegexRules(rules) {
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

function closeWindow() {
  chrome.tabs.getCurrent((tab) => {
    if (!tab) {
      // options.html is a prompt diaglog
      window.close();
    } else if (tab.url.startsWith(chrome.runtime.getURL(""))) {
      // options.html is in a tab (or Firefox Android)
      // close the tab
      chrome.tabs.remove(tab.id, () => {});
    } else {
      // options.html is embedded in about:addon in Firefox
      // do not close the tab
    }
  });
}

window.addEventListener("DOMContentLoaded", (event) => {
  // load languages
  scrapbook.loadLanguages(document);

  // event handlers
  document.getElementById("opt_capture.scrapbookFolder").addEventListener("change", (event) => {
    const elem = event.target;
    // make sure it's a valid path for chrome.downloads.download
    elem.value = elem.value.split(/[\\\/]/).map(x => scrapbook.validateFilename(x)).join('/');
  });

  document.getElementById("options").addEventListener("submit", (event) => {
    event.preventDefault();

    // check for input regex rules
    if (!checkRegexRules()) {
      return;
    }
    
    for (const id in scrapbook.options) {
      // Overwrite only keys with a defined value so that
      // keys not listed in the options page are not nullified.
      // In Chrome, storageArea.set({key: undefined}) does not store to key.
      // In Firefox, storageArea.set({key: undefined}) stores null to key.
      const value = getOptionFromDocument(id);
      if (typeof value !== "undefined") {
        scrapbook.options[id] = value;
      }
    }
    scrapbook.saveOptions().then(() => {
      closeWindow();
    });
  });

  document.getElementById("reset").addEventListener("click", (event) => {
    event.preventDefault();
    resetOptions();
  });

  document.getElementById("export").addEventListener("click", (event) => {
    event.preventDefault();
    exportOptions();
  });

  document.getElementById("import").addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("import-input").click();
  });

  document.getElementById("import-input").addEventListener("change", (event) => {
    event.preventDefault();
    const file = event.target.files[0];
    importOptions(file);
  });

  // default options
  initDefaultOptions();
});
