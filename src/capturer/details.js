/******************************************************************************
 *
 * Script for details.html.
 *
 * @require {Object} scrapbook
 * @public {Object} details
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.details = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, console) {

  'use strict';

  let gTaskInfo;

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
      }

      showSoureInTitle: {
        let source;
        if (gTaskInfo.tasks.length === 1) {
          if (Number.isInteger(gTaskInfo.tasks[0].tabId)) {
            const tabId = gTaskInfo.tasks[0].tabId;
            const frameId = Number.isInteger(gTaskInfo.tasks[0].frameId) ? ':' + gTaskInfo.tasks[0].frameId : '';
            const title = gTaskInfo.tasks[0].title ? ' ' + gTaskInfo.tasks[0].title : 
                gTaskInfo.tasks[0].url ? ' ' + gTaskInfo.tasks[0].url : '';
            source = `[${tabId}${frameId}]${title}`;
          } else if (gTaskInfo.tasks[0].url) {
            source = gTaskInfo.tasks[0].url;
          }
        } else {
          source = '*';
        }
        if (source) {
          document.title = scrapbook.lang('CaptureDetailsTitleForSource', [source]);
        }
      }

      if (gTaskInfo.options["capture.saveTo"] === "server" ||
          gTaskInfo.tasks.some(task => task.recaptureInfo || task.mergeCaptureInfo)) {
        await scrapbook.loadOptionsAuto;
        await server.init();
        if (gTaskInfo.bookId === null) {
          gTaskInfo.bookId = server.bookId;
        }
        const wrapper = document.getElementById('tasks_bookId');
        for (const bookId of Object.keys(server.books).sort()) {
          const book = server.books[bookId];
          const opt = wrapper.appendChild(document.createElement('option'));
          opt.value = book.id;
          opt.textContent = book.name;
        }

        if (gTaskInfo.tasks.length === 1) {
          if (gTaskInfo.tasks[0].title) {
            let opt;
            opt = document.getElementById('task_title-preset').appendChild(document.createElement('option'));
            opt.value = gTaskInfo.tasks[0].title;
            opt = document.getElementById('captureInfoType-recapture-task_title-preset').appendChild(document.createElement('option'));
            opt.value = gTaskInfo.tasks[0].title;
          }
        } else {
          for (const elem of document.querySelectorAll('.ui-single-item')) {
            elem.hidden = true;
          }
        }
      } else {
        document.getElementById('group_save').hidden = true;

        // replace #tasks_bookId to allow filling null value
        const bookIdElem = document.createElement('input');
        bookIdElem.id = 'tasks_bookId';
        bookIdElem.type = 'hidden';
        document.getElementById('tasks_bookId').replaceWith(bookIdElem);
      }

      if (gTaskInfo.options["capture.saveAs"] === "singleHtml") {
        for (const elem of document.querySelectorAll(`.ui-captureDownLink-inDepth`)) {
          elem.hidden = true;
        }
      }

      for (const elem of document.querySelectorAll('[id^="tasks_"]')) {
        const key = elem.id.slice(6);
        const value = gTaskInfo[key];
        if (typeof value !== 'undefined') {
          setOptionToElement(elem, value);
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

  function updateUi() {
    if (gTaskInfo.tasks.length === 1) {
      const captureInfoType = document.getElementById('captureInfoType').value;
      for (const elem of document.querySelectorAll(`.ui-captureInfoType-normal, .ui-captureInfoType-recapture, .ui-captureInfoType-mergeCapture`)) {
        elem.hidden = !elem.matches(`.ui-captureInfoType-${captureInfoType}`);
      }
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
  };

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

    if (taskInfo.tasks.length === 1) {
      for (const elem of document.querySelectorAll('[id^="task_"]')) {
        const key = elem.id.slice(5);
        const value = getOptionFromElement(elem);
        taskInfo.tasks[0][key] = value;
      }

      switch (document.getElementById('captureInfoType').value) {
        case "recapture": {
          Object.assign(taskInfo.tasks[0], {
            title: document.getElementById('captureInfoType-recapture-task_title').value,
            comment: document.getElementById('captureInfoType-recapture-task_comment').value,
            recaptureInfo: {
              bookId: taskInfo.bookId,
              itemId: taskInfo.parentId,
            },
          });
          break;
        }
        case "mergeCapture": {
          Object.assign(taskInfo.tasks[0], {
            title: void 0,
            comment: void 0,
            mergeCaptureInfo: {
              bookId: taskInfo.bookId,
              itemId: taskInfo.parentId,
            },
          });
          break;
        }
      }
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
  };

  async function onSubmit(event) {
    event.preventDefault();
    const taskInfo = parseTasks();
    await capture({taskInfo});
    await exit();
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
    await capture({dialog: 'advanced', taskInfo});
    await exit();
  }

  function onTooltipClick(event) {
    event.preventDefault();
    const elem = event.currentTarget;
    toggleTooltip(elem);
  }

  function onFormChange(event) {
    details.updateUi();
  }

  async function onFillParentIdClick(event) {
    await scrapbook.invokeItemPicker({
      targetTabId: (await browser.tabs.getCurrent()).id,
      targetCallback: 'details.pickItem',
      bookId: getOptionFromElement(document.getElementById('tasks_bookId')),
    });
  }

  async function onFillDownLinkDocUrlFilterChange(event) {
    const elem = event.target;
    const inputElem = document.getElementById('opt_capture.downLink.doc.urlFilter');

    const tabId = gTaskInfo.tasks[0].tabId;
    const frameId = gTaskInfo.tasks[0].frameId || 0;
    const url = gTaskInfo.tasks[0].url;

    try {
      switch (elem.value) {
        case "origin": {
          const sourceUrl = Number.isInteger(tabId) ? (await browser.webNavigation.getFrame({tabId, frameId})).url : url;
          const u = new URL(sourceUrl);
          u.pathname = u.search = u.hash = '';
          const linksText = '/^' + scrapbook.escapeRegExp(u.href).replace(/\\\//g, '/') + '/';
          insertInputText(inputElem, linksText);
          break;
        }
        case "dir": {
          const sourceUrl = Number.isInteger(tabId) ? (await browser.webNavigation.getFrame({tabId, frameId})).url : url;
          const u = new URL(sourceUrl);
          u.search = u.hash = '';
          let base = u.href, pos;
          if ((pos = base.lastIndexOf("/")) !== -1) { base = base.slice(0, pos + 1); }
          const linksText = '/^' + scrapbook.escapeRegExp(base).replace(/\\\//g, '/') + '/';
          insertInputText(inputElem, linksText);
          break;
        }
        case "path": {
          const sourceUrl = Number.isInteger(tabId) ? (await browser.webNavigation.getFrame({tabId, frameId})).url : url;
          const u = new URL(sourceUrl);
          u.search = u.hash = '';
          const linksText = '/^' + scrapbook.escapeRegExp(u.href).replace(/\\\//g, '/') + '/';
          insertInputText(inputElem, linksText);
          break;
        }
        case "selectedLinks":
        case "allLinks": {
          await scrapbook.initContentScripts(tabId, frameId);
          const links = await scrapbook.invokeContentScript({
            tabId,
            frameId,
            cmd: "capturer.retrieveSelectedLinks",
            args: {select: elem.value === 'selectedLinks' ? 'selected' : 'all'},
          });
          const linksText = links
            .map(x => x.url + ' ' + x.title.replace(/[ \t\r\n\f]+/g, ' ').replace(/^ +/, '').replace(/ +$/, ''))
            .join('\n');
          insertInputText(inputElem, linksText);
          break;
        }
      }
    } finally {
      elem.value = '';
    }
  }

  function pickItem({id, title, bookId}) {
    if (typeof bookId !== 'undefined') {
      setOptionToElement(document.getElementById('tasks_bookId'), bookId);
    }
    if (typeof id !== 'undefined') {
      setOptionToElement(document.getElementById('tasks_parentId'), id);

      // reset the label of the option to match title
      document.getElementById('tasks_parentId').querySelector(`option[value="${CSS.escape(id)}"]`).textContent = title || id;
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
    document.getElementById('fill-tasks_parentId').addEventListener('click', onFillParentIdClick);
    document.getElementById('fill-opt_capture.downLink.doc.urlFilter').addEventListener('change', onFillDownLinkDocUrlFilterChange);

    document.getElementById('captureInfoType').addEventListener('change', onFormChange);
    for (const elem of document.querySelectorAll('[id^="opt_"]')) {
      elem.addEventListener("change", onFormChange);
    }

    for (const elem of document.querySelectorAll('#wrapper :valid, #wrapper :invalid')) {
      elem.addEventListener("invalid", onInvalid);
    }

    for (const elem of document.querySelectorAll('a[data-tooltip]')) {
      elem.addEventListener("click", onTooltipClick);
    }

    init();
  });

  return {
    capture,
    pickItem,
    updateUi,
  };

}));
