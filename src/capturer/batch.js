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
    if (typeof data.tasks !== 'undefined') {
      document.getElementById('urls').value = stringifyTasks(data.tasks, document.getElementById('opt-useJson').checked);
    }
  }

  async function capture({inputText, customTitle, useJson, uniquify}) {
    let tasks = parseInputText(inputText, useJson);

    // remove duplicated URLs
    if (uniquify) {
      const urls = new Set();
      tasks = tasks.filter((task) => {
        const normalizedUrl = scrapbook.normalizeUrl(task.url);
        if (urls.has(normalizedUrl)) {
          return false;
        }
        urls.add(normalizedUrl);
        return true;
      });
    }

    // remove title if customTitle is not set
    if (!customTitle) {
      for (const i in tasks) {
        delete(tasks[i].title);
      }
    }

    await scrapbook.invokeCapture(tasks);
    window.close();
  }

  function parseInputText(inputText, useJson = false) {
    if (useJson) {
      const tasks = JSON.parse(inputText);
      if (!Array.isArray(tasks)) {
        throw new Error('JSON data is not an Array.');
      }
      return tasks;
    }

    return inputText
      .split('\n')
      .map(line => {
        const [_, url, title] = line.match(/^(\S*)(?:\s+(.*))?$/mu);
        if (!url) { return null; }
        if (!title) { return {url}; }
        return {url, title};
      })
      .filter(x => x !== null)
      .map(x => {
        x.mode = 'source';
        return x;
      });
  }

  function stringifyTasks(tasks, useJson = false) {
    if (useJson) {
      return JSON.stringify(tasks, null, 2);
    }

    if (tasks) {
      return tasks
        .filter(x => x && x.url)
        .map(x => {
          if (x.title) {
            return x.url + ' ' + x.title;
          }
          return x.url;
        })
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

  function onToggleTooltip(elem) {
    if (!onToggleTooltip.tooltipMap) {
      onToggleTooltip.tooltipMap = new WeakMap();
    }
    const tooltipMap = onToggleTooltip.tooltipMap;

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

  document.addEventListener('DOMContentLoaded', async () => {
    scrapbook.loadLanguages(document);

    document.getElementById('opt-useJson').addEventListener('change', (event) => {
      const inputText = document.getElementById('urls').value;
      const useJson = event.target.checked;

      let tasks;
      try {
        tasks = parseInputText(inputText, !useJson);
      } catch (ex) {
        console.error(ex);
        return;
      }

      const newInputText = stringifyTasks(tasks, useJson);
      updateInputText(document.getElementById('urls'), newInputText);
    });
    document.getElementById('btn-capture').addEventListener('click', (event) => {
      const inputText = document.getElementById('urls').value;
      const customTitle = document.getElementById('opt-customTitle').checked;
      const useJson = document.getElementById('opt-useJson').checked;
      const uniquify = document.getElementById('opt-uniquify').checked;

      capture({inputText, customTitle, useJson, uniquify}).catch((ex) => {
        console.error(ex);
        alert(`Error: ${ex.message}`);
      });
    });
    document.getElementById('btn-abort').addEventListener('click', async (event) => {
      const tab = await browser.tabs.getCurrent();
      return browser.tabs.remove(tab.id);
    });

    for (const elem of document.querySelectorAll('a[data-tooltip]')) {
      elem.addEventListener("click", (event) => {
        event.preventDefault();
        const elem = event.currentTarget;
        onToggleTooltip(elem);
      });
    }

    init();
  });

  return {
    capture,
  };

}));
