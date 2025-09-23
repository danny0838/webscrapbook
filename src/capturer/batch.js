/******************************************************************************
 * Script for batch.html.
 *
 * @requires scrapbook
 * @module batch
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.batch = factory(
    global.isDebug,
    global.scrapbook,
  );
}(this, function (isDebug, scrapbook) {

'use strict';

let gTaskInfo;

async function init() {
  const missionId = new URL(document.URL).searchParams.get('mid');
  if (!missionId) { return; }

  const key = {table: "batchCaptureMissionCache", id: missionId};
  let data;
  try {
    data = await scrapbook.cache.get(key);
    await scrapbook.cache.remove(key);
    if (!data) { throw new Error(`Missing data for mission "${missionId}".`); }
    gTaskInfo = data.taskInfo;
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

async function capture({dialog = null, taskInfo, ignoreTitle, uniquify}) {
  await scrapbook.invokeCaptureEx({dialog, taskInfo, ignoreTitle, uniquify, waitForResponse: false});
}

function parseInputText(inputText) {
  const taskInfo = JSON.parse(JSON.stringify(gTaskInfo)) || {};
  const tasks = inputText
    .split('\n')
    .reduce((tasks, line) => {
      let [_, url, title] = line.match(/^(\S*)(?:\s+(.*))?$/mu);
      if (!url) { return tasks; }
      if (!title) { title = undefined; }
      if (url.startsWith('tab:')) {
        let [_, tabId, frameId] = url.split(':');
        tabId = parseInt(tabId, 10);
        if (!Number.isInteger(tabId)) { return tasks; }
        frameId = parseInt(frameId, 10);
        if (!Number.isInteger(frameId)) { frameId = undefined; }
        tasks.push({tabId, frameId, title});
      } else {
        tasks.push({url, title});
      }
      return tasks;
    }, []);
  return Object.assign(taskInfo, {tasks});
}

function stringifyTasks(taskInfo) {
  if (taskInfo) {
    return taskInfo.tasks
      .reduce((lines, task) => {
        let line;
        if (Number.isInteger(task.tabId)) {
          if (Number.isInteger(task.frameId)) {
            line = `tab:${task.tabId}:${task.frameId}`;
          } else {
            line = `tab:${task.tabId}`;
          }
        } else if (task.url) {
          line = task.url;
        } else {
          return lines;
        }
        if (task.title) {
          line += ' ' + scrapbook.split(task.title).join(' ');
        }
        lines.push(line);
        return lines;
      }, [])
      .join('\n');
  }
  return '';
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

async function onCaptureClick(event) {
  const inputText = document.getElementById('tasks').value;
  const ignoreTitle = document.getElementById('opt-ignoreTitle').checked;
  const uniquify = document.getElementById('opt-uniquify').checked;

  const taskInfo = parseInputText(inputText);
  await capture({taskInfo, ignoreTitle, uniquify});
  await exit();
}

async function onAbortClick(event) {
  await exit();
}

async function onAdvancedClick(event) {
  const inputText = document.getElementById('tasks').value;
  const ignoreTitle = document.getElementById('opt-ignoreTitle').checked;
  const uniquify = document.getElementById('opt-uniquify').checked;

  const taskInfo = Object.assign({
    tasks: [],
    mode: "",
    bookId: null,
    parentId: "root",
    index: null,
    delay: null,
  }, parseInputText(inputText));
  await capture({dialog: 'advanced', taskInfo, ignoreTitle, uniquify});
  await exit();
}

function onTooltipClick(event) {
  event.preventDefault();
  const elem = event.currentTarget;
  toggleTooltip(elem);
}

document.addEventListener('DOMContentLoaded', async () => {
  scrapbook.loadLanguages(document);

  document.getElementById('btn-capture').addEventListener('click', onCaptureClick);
  document.getElementById('btn-abort').addEventListener('click', onAbortClick);
  document.getElementById('btn-advanced').addEventListener('click', onAdvancedClick);

  for (const elem of document.querySelectorAll('a[data-tooltip]')) {
    elem.addEventListener("click", onTooltipClick);
  }

  init();
});

return {
  capture,
};

}));
