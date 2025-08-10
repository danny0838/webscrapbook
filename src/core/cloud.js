/******************************************************************************
 * Script for cloud.html
 *
 * @requires scrapbook
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  factory(
    global.isDebug,
    global.scrapbook,
  );
}(this, function (isDebug, scrapbook) {

'use strict';

function getTableKey(name, ts, size) {
  return JSON.stringify({table: "cloudFiles", ts, name, size});
}

function getTableKeyInfo(key) {
  let info;
  try {
    info = JSON.parse(key);
    if (info.table !== "cloudFiles") {
      throw new Error('invalid table key');
    }
  } catch (ex) {
    return null;
  }
  return info;
}

function getDeviceKey() {
  return JSON.stringify({table: "cloudDevice"});
}

async function getDeviceName() {
  const key = getDeviceKey();
  const defauleName = navigator.platform;
  return (await browser.storage.local.get(key))[key] || defauleName;
}

async function refreshTable() {
  try {
    const table = document.querySelector('table');
    table.tBodies[0].textContent = '';

    const keys = await (async () => {
      // supported in Chromium >= 130
      if (browser.storage.sync.getKeys) {
        return await browser.storage.sync.getKeys();
      }

      return Object.keys(await browser.storage.sync.get());
    })();

    for (const key of keys) {
      const keyInfo = getTableKeyInfo(key);
      if (!keyInfo) { continue; }

      const {name, ts, size} = keyInfo;

      const tr = table.tBodies[0].appendChild(document.createElement('tr'));
      const td1 = tr.appendChild(document.createElement('td'));
      td1.append(name);
      const td2 = tr.appendChild(document.createElement('td'));
      td2.dataset.value = ts;
      td2.append(new Date(ts).toLocaleString());
      const td3 = tr.appendChild(document.createElement('td'));
      td3.dataset.value = size;
      td3.textContent = size;
      const td4 = tr.appendChild(document.createElement('td'));
      const dl = td4.appendChild(document.createElement('input'));
      dl.type = 'button';
      dl.name = 'apply';
      dl.value = scrapbook.lang('CloudFileActionApplyLabel');
      const del = td4.appendChild(document.createElement('input'));
      del.type = 'button';
      del.name = 'delete';
      del.value = scrapbook.lang('CloudFileActionDeleteLabel');
    }
  } catch (ex) {
    console.error(ex);
    alert(`Failed to refresh table: ${ex}`);
  }
}

async function applyEntry(tr) {
  try {
    const name = tr.cells[0].textContent;
    const ts = Number(tr.cells[1].dataset.value);
    const size = Number(tr.cells[2].dataset.value);
    const key = getTableKey(name, ts, size);

    const data = (await browser.storage.sync.get(key))[key];
    for (const key in data) {
      if (data[key] === scrapbook.DEFAULT_OPTIONS[key]) {
        delete data[key];
      }
    }
    const keysToRemove = Object.keys(scrapbook.DEFAULT_OPTIONS).filter(key => !(key in data));

    await browser.storage.local.set(data);
    await browser.storage.local.remove(keysToRemove);
    alert(scrapbook.lang("CloudFileActionApplySuccess"));
  } catch (ex) {
    console.error(ex);
    alert(`Failed to apply entry: ${ex}`);
  }
}

async function deleteEntry(tr) {
  try {
    const name = tr.cells[0].textContent;
    const ts = Number(tr.cells[1].dataset.value);
    const size = Number(tr.cells[2].dataset.value);
    const key = getTableKey(name, ts, size);
    await browser.storage.sync.remove(key);
  } catch (ex) {
    console.error(ex);
    alert(`Failed to delete entry: ${ex}`);
  }
}

async function store() {
  try {
    const name = await getDeviceName();
    const ts = Date.now();
    const data = await scrapbook.getOptions();

    // remove default options
    for (const [key, value] of Object.entries(scrapbook.DEFAULT_OPTIONS)) {
      if (data[key] === value) { delete data[key]; }
    }

    const size = new Blob([JSON.stringify(data)]).size;

    const key = getTableKey(name, ts, size);
    await browser.storage.sync.set({[key]: data});
  } catch (ex) {
    console.error(ex);
    alert(`Failed to store: ${ex}`);
  }
}

async function rename() {
  try {
    const defaultName = await getDeviceName();
    const name = prompt(scrapbook.lang('CloudRenamePrompt'), defaultName);
    if (name === null) { return; }

    await browser.storage.local.set({[getDeviceKey()]: name.trim()});
  } catch (ex) {
    console.error(ex);
    alert(`Failed to rename: ${ex}`);
  }
}

function onTableClick(event) {
  const btn = event.target.closest('input[type=button]');
  if (!btn) { return; }
  const tr = btn.closest('tr');
  if (!tr) { return; }
  event.preventDefault();
  switch (btn.name) {
    case 'apply':
      applyEntry(tr);
      break;
    case 'delete':
      deleteEntry(tr);
      break;
  }
}

function onStoreClick(event) {
  event.preventDefault();
  store();
}

function onRenameClick(event) {
  event.preventDefault();
  rename();
}

browser.storage.sync.onChanged.addListener(async (details) => {
  for (const key in details) {
    if (getTableKeyInfo(key)) {
      await refreshTable();
      break;
    }
  }
});

window.addEventListener("DOMContentLoaded", async (event) => {
  // load languages
  scrapbook.loadLanguages(document);

  document.querySelector("table").addEventListener("click", onTableClick);
  document.getElementById("store").addEventListener("click", onStoreClick);
  document.getElementById("rename").addEventListener("click", onRenameClick);

  // refresh table
  await refreshTable();
});

}));
