/******************************************************************************
 * Script for advanced.html.
 *
 * @requires scrapbook
 * @module advanced
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.advanced = factory(
    global.isDebug,
    global.scrapbook,
  );
}(this, function (isDebug, scrapbook) {

'use strict';

async function init() {
  const missionId = new URL(document.URL).searchParams.get('mid');
  if (!missionId) { return; }

  const key = {table: "batchCaptureMissionCache", id: missionId};
  let data;
  try {
    data = await scrapbook.cache.get(key);
    await scrapbook.cache.remove(key);
    if (!data) { throw new Error(`Missing data for mission "${missionId}".`); }
  } catch (ex) {
    console.error(ex);
    return;
  }

  if (typeof data.ignoreTitle !== 'undefined') {
    document.getElementById('opt-ignoreTitle').checked = data.ignoreTitle;
  }
  if (typeof data.uniquify !== 'undefined') {
    document.getElementById('opt-uniquify').checked = data.uniquify;
  }
  if (typeof data.taskInfo !== 'undefined') {
    document.getElementById('tasks').value = stringifyTasks(data.taskInfo);
  }
}

async function capture({taskInfo, ignoreTitle, uniquify}) {
  await scrapbook.invokeCaptureEx({taskInfo, ignoreTitle, uniquify, waitForResponse: false});
}

function parseInputText(inputText) {
  const taskInfo = JSON.parse(inputText);
  if (typeof taskInfo !== 'object' || taskInfo === null || Array.isArray(taskInfo)) {
    throw new Error('JSON data is not a valid object.');
  } else if (!Array.isArray(taskInfo.tasks)) {
    throw new Error('"tasks" property of JSON data is not an Array.');
  }
  return taskInfo;
}

function parseTasks(reportError = true) {
  const inputElem = document.getElementById('tasks');
  const inputText = inputElem.value;

  let taskInfo;
  try {
    taskInfo = parseInputText(inputText);
  } catch (ex) {
    event.preventDefault();
    inputElem.setCustomValidity(ex.message);
    if (reportError) {
      inputElem.reportValidity();
    }
    return null;
  }

  inputElem.setCustomValidity('');
  return taskInfo;
}

function stringifyTasks(taskInfo) {
  // pre-defined order of keys for better userbility
  const info = {
    tasks: undefined,
    bookId: undefined,
    parentId: undefined,
    index: undefined,
    mode: undefined,
    delay: undefined,
    autoClose: undefined,
    options: undefined,
  };
  Object.assign(info, taskInfo);
  return JSON.stringify(info, null, 1);
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

function onTasksChange(event) {
  parseTasks();
}

async function onCaptureClick(event) {
  const taskInfo = parseTasks();
  if (!taskInfo) { return; }

  const ignoreTitle = document.getElementById('opt-ignoreTitle').checked;
  const uniquify = document.getElementById('opt-uniquify').checked;

  await capture({taskInfo, ignoreTitle, uniquify});
  await exit();
}

async function onAbortClick(event) {
  await exit();
}

function onTooltipClick(event) {
  event.preventDefault();
  const elem = event.currentTarget;
  toggleTooltip(elem);
}

document.addEventListener('DOMContentLoaded', async () => {
  scrapbook.loadLanguages(document);

  document.getElementById('tasks').addEventListener('change', onTasksChange);
  document.getElementById('btn-capture').addEventListener('click', onCaptureClick);
  document.getElementById('btn-abort').addEventListener('click', onAbortClick);

  for (const elem of document.querySelectorAll('a[data-tooltip]')) {
    elem.addEventListener("click", onTooltipClick);
  }

  init();
});

return {
  capture,
};

}));
