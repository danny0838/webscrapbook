/********************************************************************
 *
 * Manage options
 *
 *******************************************************************/

var OPTION_PREFIX = "opt_";

function initDefaultOptions() {
  // create elements for default options
  for (let id in scrapbook.options) {
    let value = scrapbook.options[id];

    let p = document.createElement("p");
    document.getElementById("optionsWrapper").appendChild(p);

    let label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = id + ": ";
    p.appendChild(label);

    switch(Object.prototype.toString.call(value)) {
      case "[object Boolean]": {
        let input = document.createElement("input");
        input.id = OPTION_PREFIX + id;
        input.setAttribute("type", "checkbox");
        value && input.setAttribute("checked", "checked");
        p.appendChild(input);
        break;
      }
      case "[object Number]": {
        let input = document.createElement("input");
        input.id = OPTION_PREFIX + id;
        input.setAttribute("type", "number");
        input.setAttribute("value", value);
        p.appendChild(input);
        break;
      }
      case "[object Array]": {
        let input = document.createElement("select");
        input.id = OPTION_PREFIX + id;
        input.setAttribute("type", "select");
        p.appendChild(input);
        for (let i=0, I=value.length; i<I-1; ++i) {
          let item = value[i];
          let option = document.createElement("option");
          option.value = option.textContent = item;
          input.appendChild(option);
        }
        break;
      }
      default: {  // string
        let input = document.createElement("input");
        input.id = OPTION_PREFIX + id;
        input.setAttribute("type", "text");
        input.setAttribute("value", value);
        p.appendChild(input);
        break;
      }
    }
  }

  // load from sync
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
