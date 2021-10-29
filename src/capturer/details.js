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
        if (Number.isInteger(gTaskInfo.tasks[0].tabId)) {
          const tabId = gTaskInfo.tasks[0].tabId;
          const frameId = Number.isInteger(gTaskInfo.tasks[0].frameId) ? ':' + gTaskInfo.tasks[0].frameId : '';
          const title = gTaskInfo.tasks[0].title ? ' ' + gTaskInfo.tasks[0].title : 
              gTaskInfo.tasks[0].url ? ' ' + gTaskInfo.tasks[0].url : '';
          source = `[${tabId}${frameId}]${title}`;
        } else if (gTaskInfo.tasks[0].url) {
          source = gTaskInfo.tasks[0].url;
        }
        if (source) {
          document.title = scrapbook.lang('CaptureDetailsTitleForSource', [source]);
        }
      }

      const toServer = gTaskInfo.options["capture.saveTo"] === "server"
        || gTaskInfo.tasks[0].recaptureInfo || gTaskInfo.tasks[0].mergeCaptureInfo;
      if (toServer) {
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
        if (gTaskInfo.tasks[0].title) {
          let opt;
          opt = document.getElementById('task_title-preset').appendChild(document.createElement('option'));
          opt.value = gTaskInfo.tasks[0].title;
          opt = document.getElementById('captureInfoType-recapture-task_title-preset').appendChild(document.createElement('option'));
          opt.value = gTaskInfo.tasks[0].title;
        }
      } else {
        document.getElementById('group_save').hidden = true;
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
      for (const elem of document.querySelectorAll('[id^="task_"]')) {
        const key = elem.id.slice(5);
        const value = gTaskInfo.tasks[0][key];
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

      // overwrite tasks_bookId and tasks_parentId with recaptureInfo or mergeCaptureInfo
      if (gTaskInfo.tasks[0].recaptureInfo) {
        document.getElementById('captureInfoType').value = 'recapture';
        document.getElementById('tasks_bookId').value = gTaskInfo.tasks[0].recaptureInfo.bookId;
        document.getElementById('tasks_parentId').value = gTaskInfo.tasks[0].recaptureInfo.itemId;
        delete gTaskInfo.tasks[0].recaptureInfo;
      } else if (gTaskInfo.tasks[0].mergeCaptureInfo) {
        document.getElementById('captureInfoType').value = 'mergeCapture';
        document.getElementById('tasks_bookId').value = gTaskInfo.tasks[0].mergeCaptureInfo.bookId;
        document.getElementById('tasks_parentId').value = gTaskInfo.tasks[0].mergeCaptureInfo.itemId;
        delete gTaskInfo.tasks[0].mergeCaptureInfo;
      }

      updateUi();

      document.body.hidden = false;
    } catch (ex) {
      console.error(ex);
      alert(`Error: ${ex.message}`);
    }
  }

  function getOptionFromElement(elem) {
    if (elem.matches('input[type="checkbox"]')) {
      return elem.checked;
    } else if (elem.matches('input[type="number"]')) {
      return elem.validity.valid && elem.value !== "" ? elem.valueAsNumber : null;
    } else {
      return elem.value;
    }
  }

  function setOptionToElement(elem, value) {
    if (elem.matches('input[type="checkbox"]')) {
      elem.checked = !!value;
    } else {
      elem.value = value;

      // If the given value is not included in the options,
      // generate a hidden option element for it.
      if (elem.matches('select') && elem.value != value) {
        const c = elem.appendChild(document.createElement('option'));
        c.hidden = true;
        c.value = c.textContent = value;
        elem.value = value;
      }
    }
  }

  function updateUi() {
    const captureInfoType = document.getElementById('captureInfoType').value;
    for (const elem of document.querySelectorAll(`.ui-captureInfoType-normal, .ui-captureInfoType-recapture, .ui-captureInfoType-mergeCapture`)) {
      elem.hidden = !elem.matches(`.ui-captureInfoType-${captureInfoType}`);
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

  async function capture({dialog = null, taskInfo, ignoreTitle = false, uniquify = true}) {
    await scrapbook.invokeCaptureEx({dialog, taskInfo, ignoreTitle, uniquify, waitForResponse: false});
  }

  function parseTasks() {
    const taskInfo = JSON.parse(JSON.stringify(gTaskInfo));
    for (const elem of document.querySelectorAll('[id^="tasks_"]')) {
      const key = elem.id.slice(6);
      const value = getOptionFromElement(elem);
      taskInfo[key] = value;
    }
    for (const elem of document.querySelectorAll('[id^="task_"]')) {
      const key = elem.id.slice(5);
      const value = getOptionFromElement(elem);
      taskInfo.tasks[0][key] = value;
    }
    for (const elem of document.querySelectorAll('[id^="opt_"]')) {
      const key = elem.id.slice(4);
      const value = getOptionFromElement(elem);
      taskInfo.options[key] = value;
    }

    // special handling
    taskInfo.parentId = taskInfo.parentId || "root";

    if (taskInfo.options["capture.saveTo"] === "server") {
      const captureInfoType = document.getElementById('captureInfoType').value;
      switch (captureInfoType) {
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

  function pickItem({id, bookId}) {
    if (typeof bookId !== 'undefined') {
      document.getElementById('tasks_bookId').value = bookId;
    }
    if (typeof id !== 'undefined') {
      document.getElementById('tasks_parentId').value = id;
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
