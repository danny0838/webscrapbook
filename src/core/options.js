/********************************************************************
 *
 * Manage options
 *
 *******************************************************************/

var OPTION_PREFIX = "opt_";

function initDefaultOptions() {
  scrapbook.loadOptions((options) => {
    for (let id in options) {
      setOptionToDocument(id, options[id]);
    }
  });
}

function getOptionFromDocument(id) {
  var elem = document.getElementById(OPTION_PREFIX + id);
  if (!elem) { return; }
  switch (elem.getAttribute("type")) {
    case "checkbox":
      return elem.checked;
    default:
      return elem.value;
  }
}

function setOptionToDocument(id, value) {
  var elem = document.getElementById(OPTION_PREFIX + id);
  if (!elem) { return; }
  switch (elem.getAttribute("type")) {
    case "checkbox":
      elem.checked = value;
      break;
    default:
      elem.value = value;
      break;
  }
}

function exportOptions() {
  var data = new Blob([JSON.stringify(scrapbook.options, null, 2)], {type: "application/json"});
  var elem = document.createElement("a");
  elem.href = URL.createObjectURL(data);
  elem.download = "webscrapbook.options." + scrapbook.dateToId().slice(0, 8) + ".json";
  document.body.appendChild(elem);
  elem.click();
  elem.remove();
}

function importOptions() {
  document.getElementById("import-input").click();
}

function importFile(file) {
  document.getElementById("import-input").value = null;

  let reader = new FileReader();
  reader.onloadend = function (event) {
    var text = event.target.result;
    try {
      let data = JSON.parse(text);
      var options = Object.assign(scrapbook.options, data);
    } catch (ex) {
      showMessage(scrapbook.lang("ErrorImportOptions", [ex]));
      return;
    }

    // import options
    let remaining = 0;
    scrapbook.options = options;
    scrapbook.saveOptions((options) => {
      if (!chrome.runtime.lastError) {
        try {
          for (let id in options) {
            setOptionToDocument(id, options[id]);
          }
          showMessage(scrapbook.lang("OptionsImportSuccess"));
        } catch (ex) {
          showMessage(scrapbook.lang("ErrorImportOptions", [ex]));
        }
      } else {
        showMessage(scrapbook.lang("ErrorImportOptions", [chrome.runtime.lastError]));
      }
    });
  }
  reader.readAsText(file);
}

function showMessage(msg) {
  document.getElementById("message").textContent = msg;
  window.scrollTo(0, 0);
}

window.addEventListener("DOMContentLoaded", (event) => {
  // load languages
  scrapbook.loadLanguages(document);

  // event handlers
  document.getElementById("options").addEventListener("submit", (event) => {
    for (let id in scrapbook.options) {
      scrapbook.options[id] = getOptionFromDocument(id);
    }
    scrapbook.saveOptions(() => {
      window.close();
    });
    event.preventDefault();
  });

  document.getElementById("export").addEventListener("click", (event) => {
    exportOptions();
    event.preventDefault();
  });

  document.getElementById("import").addEventListener("click", (event) => {
    importOptions();
    event.preventDefault();
  });

  document.getElementById("import-input").addEventListener("change", (event) => {
    event.preventDefault();
    var file = event.target.files[0];
    importFile(file);
  });

  // default options
  initDefaultOptions();
});
