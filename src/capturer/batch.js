/******************************************************************************
 *
 * Script for batch.html.
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.batch = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, console) {

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

    if (typeof data.customTitle !== 'undefined') {
      document.getElementById('opt-customTitle').checked = data.customTitle;
    }
    if (typeof data.useJson !== 'undefined') {
      document.getElementById('opt-useJson').checked = data.useJson;
    }
    if (typeof data.uniquify !== 'undefined') {
      document.getElementById('opt-uniquify').checked = data.uniquify;
    }
    if (typeof data.taskInfo !== 'undefined') {
      document.getElementById('urls').value = stringifyTasks(data.taskInfo, document.getElementById('opt-useJson').checked);
    }
  }

  async function capture({inputText, customTitle, useJson, uniquify}) {
    const taskInfo = parseInputText(inputText, useJson);

    // remove duplicated URLs
    if (uniquify) {
      const urls = new Set();
      taskInfo.tasks = taskInfo.tasks.filter((task) => {
        if (task.url) {
          try {
            const normalizedUrl = scrapbook.normalizeUrl(task.url);
            if (urls.has(normalizedUrl)) {
              return false;
            }
            urls.add(normalizedUrl);
          } catch (ex) {
            throw Error(`Failed to uniquify invalid URL: ${task.url}`);
          }
        }
        return true;
      });
    }

    // remove title if customTitle is not set
    if (!customTitle) {
      for (const i in taskInfo.tasks) {
        delete(taskInfo.tasks[i].title);
      }
    }

    await scrapbook.invokeCaptureEx({taskInfo, waitForResponse: false});
  }

  function parseInputText(inputText, useJson = false) {
    if (useJson) {
      const taskInfo = JSON.parse(inputText);
      if (typeof taskInfo !== 'object' || taskInfo === null || Array.isArray(taskInfo)) {
        throw new Error('JSON data is not a valid object.');
      } else if (!Array.isArray(taskInfo.tasks)) {
        throw new Error('"tasks" property of JSON data is not an Array.');
      }
      return taskInfo;
    }

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
    return {tasks};
  }

  function stringifyTasks(taskInfo, useJson = false) {
    if (useJson) {
      return JSON.stringify(taskInfo, null, 1);
    }

    if (taskInfo) {
      return taskInfo.tasks
        .reduce((lines, task) => {
          let line;
          if (task.url) {
            line = task.url;
          } else if (Number.isInteger(task.tabId)) {
            if (Number.isInteger(task.frameId)) {
              line = `tab:${task.tabId}:${task.frameId}`;
            } else {
              line = `tab:${task.tabId}`;
            }
          } else {
            return lines;
          }
          if (task.title) {
            line += ' ' + task.title.replace(/[\r\n]+/g, ' ');
          }
          lines.push(line);
          return lines;
        }, [])
        .join('\n');
    }
    return '';
  }

  function updateInputText(elem, value) {
    // Use execCommand rather than set value to allow undo in the textarea.
    // Note that this removes current selection.
    // It does not work in Firefox, and set value as fallback:
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1220696
    elem.select();
    if (!document.execCommand('insertText', false, value)) {
      elem.value = value;
    }
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

  function onUrlsChange(event) {
    const useJson = document.getElementById('opt-useJson').checked;
    if (!useJson) { return; }

    const inputElem = event.target;
    const inputText = inputElem.value;

    try {
      parseInputText(inputText, useJson);
    } catch (ex) {
      console.error(ex);
      event.preventDefault();
      inputElem.setCustomValidity(ex.message);
      return;
    }

    inputElem.setCustomValidity('');
  }

  function onUseJsonChange(event) {
    const inputElem = document.getElementById('urls');
    const inputText = inputElem.value;
    const useJson = event.target.checked;

    let tasks;
    try {
      tasks = parseInputText(inputText, !useJson);
    } catch (ex) {
      // block invalid input to prevent missing
      console.error(ex);
      event.target.checked = !useJson;
      event.preventDefault();
      inputElem.setCustomValidity(ex.message);
      inputElem.reportValidity();
      return;
    }

    const newInputText = stringifyTasks(tasks, useJson);
    updateInputText(inputElem, newInputText);
    inputElem.setCustomValidity('');
  }

  async function onCaptureClick(event) {
    const inputElem = document.getElementById('urls');
    const inputText = inputElem.value;
    const customTitle = document.getElementById('opt-customTitle').checked;
    const useJson = document.getElementById('opt-useJson').checked;
    const uniquify = document.getElementById('opt-uniquify').checked;

    try {
      await capture({inputText, customTitle, useJson, uniquify});
      await exit();
    } catch (ex) {
      console.error(ex);
      event.preventDefault();
      inputElem.setCustomValidity(ex.message);
      inputElem.reportValidity();
      return;
    }
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

    document.getElementById('urls').addEventListener('change', onUrlsChange);
    document.getElementById('opt-useJson').addEventListener('change', onUseJsonChange);
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
