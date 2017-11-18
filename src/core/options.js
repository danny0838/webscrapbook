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
  const data = new Blob([JSON.stringify(scrapbook.options, null, 2)], {type: "application/json"});
  const elem = document.createElement("a");
  elem.href = URL.createObjectURL(data);
  elem.download = "webscrapbook.options." + scrapbook.dateToId().slice(0, 8) + ".json";
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
