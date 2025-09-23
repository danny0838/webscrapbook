/******************************************************************************
 * Script for details.html.
 *
 * @requires scrapbook
 * @requires server
 * @module details
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.details = factory(
    global.isDebug,
    global.scrapbook,
    global.server,
  );
}(this, function (isDebug, scrapbook, server) {

'use strict';

let gTaskInfo;
let gIgnoreTitle;
let gUniquify;

async function init() {
  try {
    loadTaskInfo: {
      const missionId = new URL(document.URL).searchParams.get('mid');
      if (!missionId) { throw new Error(`Missing mission ID.`); }
      const key = {table: "batchCaptureMissionCache", id: missionId};
      const data = await scrapbook.cache.get(key);
      await scrapbook.cache.remove(key);
      if (!data) { throw new Error(`Missing data for mission "${missionId}".`); }
      gTaskInfo = data.taskInfo;
      gTaskInfo.options = gTaskInfo.options || {};
      gIgnoreTitle = data.ignoreTitle;
      gUniquify = data.uniquify;
    }

    showSoureInTitle: {
      let source;
      switch (gTaskInfo.tasks.length) {
        case 1: {
          if (Number.isInteger(gTaskInfo.tasks[0].tabId)) {
            const tabId = gTaskInfo.tasks[0].tabId;
            const frameId = Number.isInteger(gTaskInfo.tasks[0].frameId) ? ':' + gTaskInfo.tasks[0].frameId : '';
            const title = gTaskInfo.tasks[0].title ? ' ' + gTaskInfo.tasks[0].title :
                gTaskInfo.tasks[0].url ? ' ' + gTaskInfo.tasks[0].url : '';
            source = `[${tabId}${frameId}]${title}`;
          } else if (gTaskInfo.tasks[0].url) {
            source = gTaskInfo.tasks[0].url;
          }
          break;
        }
        case 0: {
          source = '-';
          break;
        }
        default: {
          source = '*';
          break;
        }
      }
      if (source) {
        document.title = scrapbook.lang('CaptureDetailsTitleForSource', [source]);
      }
    }

    if (gTaskInfo.options["capture.saveTo"] === "server" ||
        gTaskInfo.tasks.some(task => task.recaptureInfo || task.mergeCaptureInfo)) {
      document.documentElement.classList.add('ui-saveTo-server');

      await scrapbook.loadOptionsAuto;
      await server.init();
      if (gTaskInfo.bookId === null) {
        gTaskInfo.bookId = server.bookId;
      }
      const wrapper = document.getElementById('tasks_bookId');
      for (const bookId of Object.keys(server.books).sort()) {
        const book = server.books[bookId];
        if (book.config.no_tree) { continue; }
        const opt = wrapper.appendChild(document.createElement('option'));
        opt.value = book.id;
        opt.textContent = book.name;
      }

      if (gTaskInfo.tasks.length === 1 && gTaskInfo.tasks[0].title) {
        let opt;
        opt = document.getElementById('task_title-preset').appendChild(document.createElement('option'));
        opt.value = gTaskInfo.tasks[0].title;
        opt = document.getElementById('captureInfoType-recapture-task_title-preset').appendChild(document.createElement('option'));
        opt.value = gTaskInfo.tasks[0].title;
      }
    } else {
      // replace #tasks_bookId to allow filling null value
      const bookIdElem = document.createElement('input');
      bookIdElem.id = 'tasks_bookId';
      bookIdElem.type = 'hidden';
      document.getElementById('tasks_bookId').replaceWith(bookIdElem);
    }

    if (gTaskInfo.tasks.length === 1) {
      document.documentElement.classList.add('ui-single-item');
    }

    if (gTaskInfo.options["capture.saveAs"] !== "singleHtml") {
      document.documentElement.classList.add('ui-downLink-inDepth');
    }

    for (const elem of document.querySelectorAll('[id^="tasks_"]')) {
      const key = elem.id.slice(6);
      const value = gTaskInfo[key];
      if (typeof value !== 'undefined') {
        setOptionToElement(elem, value);
      }
    }

    // bind book ID for parentId options
    {
      const bookId = gTaskInfo['bookId'];
      for (const elem of document.getElementById('tasks_parentId').querySelectorAll('option:not([value="root"])')) {
        if (!elem.bookIds) {
          elem.bookIds = new Set();
        }
        elem.bookIds.add(bookId);
      }
    }

    for (const elem of document.querySelectorAll('[id^="opt_"]')) {
      const key = elem.id.slice(4);
      const value = gTaskInfo.options[key];
      if (typeof value !== 'undefined') {
        setOptionToElement(elem, value);
      }
    }

    if (gTaskInfo.tasks.length === 1) {
      for (const elem of document.querySelectorAll('[id^="task_"]')) {
        const key = elem.id.slice(5);
        const value = gTaskInfo.tasks[0][key];
        if (typeof value !== 'undefined') {
          setOptionToElement(elem, value);
        }
      }

      // blank the title field and set gIgnoreTitle=false for customization
      if (gIgnoreTitle) {
        setOptionToElement(document.getElementById('task_title'), '');
        gIgnoreTitle = false;
      }

      // overwrite tasks_bookId and tasks_parentId with recaptureInfo or mergeCaptureInfo
      if (gTaskInfo.tasks[0].recaptureInfo) {
        document.getElementById('captureInfoType').value = 'recapture';
        setOptionToElement(document.getElementById('tasks_bookId'), gTaskInfo.tasks[0].recaptureInfo.bookId);
        setOptionToElement(document.getElementById('tasks_parentId'), gTaskInfo.tasks[0].recaptureInfo.itemId);
        delete gTaskInfo.tasks[0].recaptureInfo;
      } else if (gTaskInfo.tasks[0].mergeCaptureInfo) {
        document.getElementById('captureInfoType').value = 'mergeCapture';
        setOptionToElement(document.getElementById('tasks_bookId'), gTaskInfo.tasks[0].mergeCaptureInfo.bookId);
        setOptionToElement(document.getElementById('tasks_parentId'), gTaskInfo.tasks[0].mergeCaptureInfo.itemId);
        delete gTaskInfo.tasks[0].mergeCaptureInfo;
      }
    }

    updateUi();

    document.body.hidden = false;
  } catch (ex) {
    console.error(ex);
    alert(`Error: ${ex.message}`);
  }
}

function getOptionFromElement(elem) {
  if (elem.matches('input[type="hidden"]')) {
    return JSON.parse(elem.value);
  } else if (elem.matches('input[type="checkbox"]')) {
    return elem.checked;
  } else if (elem.matches('input[type="number"]')) {
    return elem.validity.valid && elem.value !== "" ? elem.valueAsNumber : null;
  } else {
    return elem.value;
  }
}

function setOptionToElement(elem, value) {
  if (elem.matches('input[type="hidden"]')) {
    elem.value = JSON.stringify(value);
  } else if (elem.matches('input[type="checkbox"]')) {
    elem.checked = !!value;
  } else {
    elem.value = value;

    // If the given value is not included in the options,
    // generate an option element for it.
    if (elem.matches('select') && elem.value != value) {
      const c = elem.appendChild(document.createElement('option'));
      c.value = c.textContent = value;
      elem.value = value;
    }
  }
}

function getDetailStatusKey() {
  return {table: "captureDetailStatus"};
}

async function loadDetailStatus() {
  const status = await scrapbook.cache.get(getDetailStatusKey(), 'storage');
  if (!status) { return; }

  for (const id in status) {
    const elem = document.getElementById(id);
    if (elem) {
      elem.open = status[id];
    }
  }
}

async function saveDetailStatus() {
  const status = {};
  for (const elem of document.querySelectorAll('details')) {
    status[elem.id] = elem.open;
  }
  await scrapbook.cache.set(getDetailStatusKey(), status, 'storage');
}

function updateUi() {
  const captureInfoType = document.getElementById('captureInfoType').value;
  for (const elem of document.querySelectorAll([
    `.ui-captureInfoType-normal`,
    `.ui-captureInfoType-recapture`,
    `.ui-captureInfoType-mergeCapture`,
  ].join(', '))) {
    elem.hidden = elem.disabled = !elem.matches(`.ui-captureInfoType-${captureInfoType}`);
  }

  for (const elem of document.querySelectorAll([
    `:root:not(.ui-saveTo-server) .ui-saveTo-server`,
    `:root:not(.ui-single-item) .ui-single-item`,
    `:root:not(.ui-downLink-inDepth) .ui-downLink-inDepth`,
  ].join(', '))) {
    elem.hidden = elem.disabled = true;
  }

  for (const elem of document.querySelectorAll('[id^="opt_"]')) {
    try {
      scrapbook.parseOption(elem.id.slice(4), elem.value);
      elem.setCustomValidity('');
    } catch (ex) {
      elem.setCustomValidity(ex.message);
    }
  }
}

function insertInputText(elem, value) {
  const sep = (elem.value && value) ? '\n' : '';
  updateInputText(elem, elem.value + sep + value);
}

function updateInputText(elem, value) {
  // Use execCommand rather than set value to allow undo in the textarea.
  // Note that this removes the current selection.
  // This may not work in Firefox < 89, and fallback to set value:
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1220696
  elem.select();
  if (!document.execCommand('insertText', false, value)) {
    elem.value = value;
  }
}

async function capture({dialog = null, taskInfo, ignoreTitle = false, uniquify = false}) {
  await scrapbook.invokeCaptureEx({dialog, taskInfo, ignoreTitle, uniquify, waitForResponse: false});
}

function parseTasks() {
  const taskInfo = JSON.parse(JSON.stringify(gTaskInfo));
  for (const elem of document.querySelectorAll('[id^="tasks_"]')) {
    const key = elem.id.slice(6);
    const value = getOptionFromElement(elem);
    taskInfo[key] = value;
  }
  for (const elem of document.querySelectorAll('[id^="opt_"]')) {
    const key = elem.id.slice(4);
    const value = getOptionFromElement(elem);
    taskInfo.options[key] = value;
  }

  // special handling
  taskInfo.parentId = taskInfo.parentId || "root";

  const options = {};
  switch (document.getElementById('captureInfoType').value) {
    case "recapture": {
      const titleElem = document.getElementById('captureInfoType-recapture-task_title');
      const commentElem = document.getElementById('captureInfoType-recapture-task_comment');
      Object.assign(options, {
        ...(!titleElem.matches(':disabled') ? {title: titleElem.value} : {}),
        ...(!commentElem.matches(':disabled') ? {comment: commentElem.value} : {}),
        recaptureInfo: {
          bookId: taskInfo.bookId,
          itemId: taskInfo.parentId,
        },
      });
      break;
    }
    case "mergeCapture": {
      Object.assign(options, {
        title: undefined,
        comment: undefined,
        mergeCaptureInfo: {
          bookId: taskInfo.bookId,
          itemId: taskInfo.parentId,
        },
      });
      break;
    }
    case "normal":
    default: {
      for (const elem of document.querySelectorAll('[id^="task_"]')) {
        if (elem.matches(':disabled')) { continue; }
        const key = elem.id.slice(5);
        const value = getOptionFromElement(elem);
        options[key] = value;
      }
      break;
    }
  }
  for (const task of taskInfo.tasks) {
    Object.assign(task, options);
  }

  return taskInfo;
}

function toggleTooltip(elem) {
  if (!toggleTooltip.tooltipMap) {
    toggleTooltip.tooltipMap = new WeakMap();
  }
  const tooltipMap = toggleTooltip.tooltipMap;

  let tooltip = tooltipMap.get(elem);
  if (tooltip) {
    tooltip.remove();
    tooltipMap.set(elem, null);
  } else {
    tooltip = elem.parentNode.insertBefore(document.createElement("div"), elem.nextSibling);
    tooltip.className = "tooltip";
    tooltip.textContent = elem.getAttribute("data-tooltip");
    tooltipMap.set(elem, tooltip);
  }
}

async function exit() {
  const tab = await browser.tabs.getCurrent();
  return await browser.tabs.remove(tab.id);
}

async function onSubmit(event) {
  event.preventDefault();
  const taskInfo = parseTasks();
  await capture({taskInfo, ignoreTitle: gIgnoreTitle, uniquify: gUniquify});
  await exit();
}

function onDetailsToggle(event) {
  saveDetailStatus();
}

function onInvalid(event) {
  const elem = event.target;
  const closedParentDetails = elem.closest('details:not([open])');
  if (closedParentDetails) {
    closedParentDetails.setAttribute('open', '');
  }
}

async function onAbortClick(event) {
  await exit();
}

async function onAdvancedClick(event) {
  if (!document.getElementById('wrapper').reportValidity()) {
    return;
  }
  const taskInfo = parseTasks();
  await capture({dialog: 'advanced', taskInfo, ignoreTitle: gIgnoreTitle, uniquify: gUniquify});
  await exit();
}

function onTooltipClick(event) {
  event.preventDefault();
  const elem = event.currentTarget;
  toggleTooltip(elem);
}

function onFormChange(event) {
  updateUi();
}

function onBookIdChange(event) {
  refreshParentIdOptions();
}

async function onFillParentIdClick(event) {
  const result = await scrapbook.openModalWindow({
    url: browser.runtime.getURL("scrapbook/itempicker.html"),
    args: {
      bookId: getOptionFromElement(document.getElementById('tasks_bookId')),
      recentItemsKey: 'scrapbookLastPickedItems',
      withRelation: !document.getElementById('tasks_index').matches(':disabled'),
    },
    windowCreateData: {width: 350, height: 600},
  });
  if (result) { pickItem(result); }
}

async function onFillDownLinkDocUrlFilterChange(event) {
  const elem = event.target;
  const command = elem.value;
  const inputElem = document.getElementById('opt_capture.downLink.doc.urlFilter');

  try {
    switch (command) {
      case "domain":
      case "origin":
      case "dir":
      case "path": {
        const tasks = gTaskInfo.tasks.map(({tabId, frameId = 0, url}) => (async () => {
          try {
            const sourceUrl = Number.isInteger(tabId) ? (await browser.webNavigation.getFrame({tabId, frameId})).url : url;
            const u = new URL(sourceUrl);
            switch (command) {
              case "domain": {
                return '/^https?://(?:[0-9A-Za-z-]+\\.)*?' +
                  scrapbook.escapeRegExp(u.hostname.replace(/^www\./, '')) +
                  '(?:\\d+)?/' + '/';
              }
              case "origin": {
                u.pathname = u.search = u.hash = '';
                return '/^' + scrapbook.escapeRegExp(u.href).replace(/\\\//g, '/') + '/';
              }
              case "dir": {
                u.search = u.hash = '';
                let base = u.href, pos;
                if ((pos = base.lastIndexOf("/")) !== -1) { base = base.slice(0, pos + 1); }
                return '/^' + scrapbook.escapeRegExp(base).replace(/\\\//g, '/') + '/';
              }
              case "path": {
                u.search = u.hash = '';
                return '/^' + scrapbook.escapeRegExp(u.href).replace(/\\\//g, '/') + '(?=[?#]|$)/';
              }
            }
          } catch (ex) {
            console.error(ex);
            return null;
          }
        })());
        const rulesText = (await Promise.all(tasks))
          .filter(x => x)
          .join('\n');
        insertInputText(inputElem, rulesText);
        break;
      }
      case "selectedLinks":
      case "allLinks": {
        const cmd = "capturer.retrieveSelectedLinks";
        const args = {select: command === 'selectedLinks' ? 'selected' : 'all'};
        const tasks = gTaskInfo.tasks.map(({tabId, frameId = 0}) => (async () => {
          try {
            if (!Number.isInteger(tabId)) {
              throw new Error('Missing tabId');
            }
            await scrapbook.initContentScripts(tabId, frameId);
            return await scrapbook.invokeContentScript({tabId, frameId, cmd, args});
          } catch (ex) {
            console.error(ex);
            return [];
          }
        })());
        const rulesText = (await Promise.all(tasks))
          .reduce((mergedLinks, links) => mergedLinks.concat(links), [])
          .map(x => x.url + ' ' + scrapbook.split(x.title).join(' '))
          .join('\n');
        insertInputText(inputElem, rulesText);
        break;
      }
      case "include":
      case "exclude": {
        const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/;
        const REGEX_SPACES = /\s+/;
        const INCLUSIVE = command === 'include';
        const PROMPT_MSG = INCLUSIVE ?
            scrapbook.lang('CaptureDetailsFillDownLinkDocUrlFilterIncludeTooltip') :
            scrapbook.lang('CaptureDetailsFillDownLinkDocUrlFilterExcludeTooltip');

        // prepare filter
        let filter;
        let input;
        let isRegex;
        while (true) {
          input = prompt(PROMPT_MSG, input);
          if (input === null) {
            break;
          }
          try {
            if (REGEX_PATTERN.test(input)) {
              filter = new RegExp(RegExp.$1, RegExp.$2);
              isRegex = true;
            } else {
              filter = new RegExp(scrapbook.escapeRegExp(input));
              isRegex = false;
            }
            break;
          } catch (ex) {
            alert(`Error: ${ex.message}`);
          }
        }
        if (!filter) {
          break;
        }

        // apply filter
        const rv = [];
        for (const line of inputElem.value.split('\n')) {
          try {
            if (!line) {
              throw new Error('empty line');
            }
            if (line.startsWith('#')) {
              throw new Error('commented');
            }
            const rule = line.split(REGEX_SPACES)[0];
            if (!rule) {
              throw new Error('empty rule');
            }
            if (REGEX_PATTERN.test(rule)) {
              throw new Error('regex rule');
            }
            filter.lastIndex = 0;
            if (filter.test(rule)) {
              if (INCLUSIVE) {
                throw new Error('filter matched');
              }
            } else {
              if (!INCLUSIVE) {
                throw new Error('filter unmatched');
              }
            }
            rv.push('# ' + line);
          } catch (ex) {
            rv.push(line);
          }
        }
        rv.push(`# -- ${INCLUSIVE ? 'included' : 'excluded'} by ${isRegex ? 'regex' : 'string'}: ${input}`);

        updateInputText(inputElem, rv.join('\n'));
        break;
      }
    }
  } finally {
    elem.value = '';
  }
}

function pickItem({bookId, id, title, index}) {
  const bookIdElem = document.getElementById('tasks_bookId');
  setOptionToElement(bookIdElem, bookId);

  const idElem = document.getElementById('tasks_parentId');
  setOptionToElement(idElem, id);

  const indexElem = document.getElementById('tasks_index');
  setOptionToElement(indexElem, index);

  if (id !== 'root') {
    const elem = idElem.selectedOptions[0];

    // bind book ID
    if (!elem.bookIds) {
      elem.bookIds = new Set();
    }
    elem.bookIds.add(bookId);

    // reset label to match title
    elem.textContent = title || id;
  }

  refreshParentIdOptions();
}

function refreshParentIdOptions() {
  const bookId = document.getElementById('tasks_bookId').value;
  const idElem = document.getElementById('tasks_parentId');
  for (const elem of idElem.querySelectorAll(`option`)) {
    elem.disabled = elem.hidden = elem.bookIds && !elem.bookIds.has(bookId);
  }
  if (idElem.selectedOptions[0].disabled) {
    idElem.value = 'root';
  }
}

scrapbook.addMessageListener((message, sender) => {
  if (!message.cmd.startsWith("details.")) { return false; }
  return true;
});

document.addEventListener('DOMContentLoaded', async () => {
  scrapbook.loadLanguages(document);

  document.getElementById('wrapper').addEventListener('submit', onSubmit);
  document.getElementById('btn-abort').addEventListener('click', onAbortClick);
  document.getElementById('btn-advanced').addEventListener('click', onAdvancedClick);
  document.getElementById('tasks_bookId').addEventListener('change', onBookIdChange);
  document.getElementById('fill-tasks_parentId').addEventListener('click', onFillParentIdClick);
  document.getElementById('fill-opt_capture.downLink.doc.urlFilter').addEventListener('change', onFillDownLinkDocUrlFilterChange);

  document.getElementById('captureInfoType').addEventListener('change', onFormChange);
  for (const elem of document.querySelectorAll('[id^="opt_"]')) {
    elem.addEventListener("change", onFormChange);
  }

  for (const elem of document.querySelectorAll('#optionsWrapper details')) {
    elem.addEventListener("toggle", onDetailsToggle);
  }

  for (const elem of document.querySelectorAll('#wrapper :valid, #wrapper :invalid')) {
    elem.addEventListener("invalid", onInvalid);
  }

  for (const elem of document.querySelectorAll('a[data-tooltip]')) {
    elem.addEventListener("click", onTooltipClick);
  }

  // load detail status
  await loadDetailStatus();

  init();
});

return {
  capture,
  pickItem,
  updateUi,
};

}));
