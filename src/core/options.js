/******************************************************************************
 * Script for options.html
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

const OPTION_PREFIX = "opt_";

async function initOptions() {
  const options = await scrapbook.getOptions();
  for (const key in options) {
    setOptionToDocument(key, options[key]);
  }
}

function getOptionFromDocument(key) {
  const elem = document.getElementById(OPTION_PREFIX + key);
  if (!elem) { return; }

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

function setOptionToDocument(key, value, includeHidden) {
  let elem = document.getElementById(OPTION_PREFIX + key);

  // If the given option is not in the form, create a hidden element to allow
  // reseting hidden values or do some hacking.
  if (!elem) {
    if (!includeHidden) { return; }

    const wrapper = document.getElementById('options');
    elem = document.createElement('input');
    elem.type = 'hidden';
    elem.id = OPTION_PREFIX + key;
    wrapper.appendChild(elem);
  }

  if (elem.matches('input[type="hidden"]')) {
    elem.value = JSON.stringify(value);
  } else if (elem.matches('input[type="checkbox"]')) {
    elem.checked = !!value;
  } else {
    elem.value = value;

    // If the given value is not included in the options,
    // generate a hidden option element for it, so that
    // importing hacking value is allowed.
    if (elem.matches('select') && elem.value != value) {
      const c = elem.appendChild(document.createElement('option'));
      c.hidden = true;
      c.value = c.textContent = value;
      elem.value = value;
    }
  }
}

function resetOptions(file) {
  for (const key in scrapbook.DEFAULT_OPTIONS) {
    setOptionToDocument(key, scrapbook.DEFAULT_OPTIONS[key], true);
  }
}

async function exportOptions() {
  const blob = new Blob([JSON.stringify(await scrapbook.getOptions(), null, 2)], {type: "application/json"});
  const filename = `webscrapbook.options.${scrapbook.dateToId().slice(0, 8)}.json`;
  const elem = document.createElement('a');
  elem.download = filename;
  elem.href = URL.createObjectURL(blob);
  document.body.appendChild(elem);
  elem.click();
  elem.remove();
}

async function importOptions(file) {
  try {
    const options = JSON.parse(await scrapbook.readFileAsText(file));
    for (const key in options) {
      setOptionToDocument(key, options[key], true);
    }
    alert(scrapbook.lang("OptionsImportSuccess"));
  } catch (ex) {
    alert(scrapbook.lang("ErrorImportOptions", [ex.message]));
  }
}

async function closeWindow() {
  const tab = await browser.tabs.getCurrent();
  if (!tab) {
    // options.html is a prompt diaglog
    window.close();
  } else if (tab.url.startsWith(browser.runtime.getURL(""))) {
    // options.html is in a tab (or Firefox Android)
    // close the tab
    return await browser.tabs.remove(tab.id);
  } else {
    // options.html is embedded in about:addon in Firefox
    // do not close the tab
  }
}

function getDetailStatusKey() {
  return {table: "optionDetailStatus"};
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
  for (const elem of document.querySelectorAll('#optionsWrapper details[id]')) {
    status[elem.id] = elem.open;
  }
  await scrapbook.cache.set(getDetailStatusKey(), status, 'storage');
}

async function refreshPermissions() {
  const perms = await scrapbook.checkPermissions();
  for (const [perm, value] of Object.entries(perms)) {
    document.getElementById(`permissions_${perm}`).hidden = value;
  }
}

function refreshForm() {
  renewCaptureSaveToDetails();
  renewCaptureSaveAsDetails();
  verifySaveFolder();
  verifySaveFilename();
  verifyDownLinkFileExtFilter();
  verifyDownLinkDocUrlFilter();
  verifyDownLinkUrlFilter();
  verifyCaptureHelpers();
  verifyAutoCapture();
  renewServerUrlRequirement();
  document.getElementById('options').reportValidity();
}

function renewCaptureSaveToDetails() {
  const mode = document.getElementById("opt_capture.saveTo").value;

  for (const elem of document.querySelectorAll('.ui-captureScrapbookFolder')) {
    elem.hidden = mode !== 'folder';
  }

  var elem = document.getElementById('opt_capture.saveAs');
  elem.querySelector('[value="folder"]').disabled = mode === 'file';
  if (elem.value === 'folder' && mode === 'file') {
    elem.querySelector(':enabled').selected = true;
  }
}

function renewCaptureSaveAsDetails() {
  const mode = document.getElementById("opt_capture.saveAs").value;

  for (const elem of document.querySelectorAll('.ui-captureMergeCssResources')) {
    elem.hidden = mode !== 'singleHtml';
  }
  for (const elem of document.querySelectorAll('.ui-captureSaveDataUriAsFile')) {
    elem.hidden = mode === 'singleHtml';
  }
}

function verifySaveFolder() {
  const elem = document.getElementById("opt_capture.saveFolder");
  if (elem.value) {
    // make sure it's a valid path for browser.downloads.download
    elem.value = scrapbook.parseOption("capture.saveFolder", elem.value);
  } else {
    elem.value = elem.placeholder;
  }
}

function verifySaveFilename() {
  const elem = document.getElementById("opt_capture.saveFilename");
  if (elem.value) {
    // make sure it's a valid path for browser.downloads.download
    elem.value = scrapbook.parseOption("capture.saveFilename", elem.value);
  } else {
    elem.value = elem.placeholder;
  }
}

function verifyDownLinkFileExtFilter() {
  const elem = document.getElementById("opt_capture.downLink.file.extFilter");
  try {
    scrapbook.parseOption("capture.downLink.file.extFilter", elem.value);
    elem.setCustomValidity('');
  } catch (ex) {
    elem.setCustomValidity(ex.message);
  }
}

function verifyDownLinkDocUrlFilter() {
  const elem = document.getElementById("opt_capture.downLink.doc.urlFilter");
  try {
    scrapbook.parseOption("capture.downLink.doc.urlFilter", elem.value);
    elem.setCustomValidity('');
  } catch (ex) {
    elem.setCustomValidity(ex.message);
  }
}

function verifyDownLinkUrlFilter() {
  const elem = document.getElementById("opt_capture.downLink.urlFilter");
  try {
    scrapbook.parseOption("capture.downLink.urlFilter", elem.value);
    elem.setCustomValidity('');
  } catch (ex) {
    elem.setCustomValidity(ex.message);
  }
}

function verifyCaptureHelpers() {
  const enabled = document.getElementById("opt_capture.helpersEnabled").checked;

  const elem = document.getElementById("opt_capture.helpers");
  elem.required = enabled;

  try {
    scrapbook.parseOption("capture.helpers", elem.value);
    elem.setCustomValidity('');
  } catch (ex) {
    elem.setCustomValidity(ex.message);
  }
}

function verifyAutoCapture() {
  const enabled = document.getElementById("opt_autocapture.enabled").checked;

  const elem = document.getElementById("opt_autocapture.rules");
  elem.required = enabled;

  try {
    scrapbook.parseOption("autocapture.rules", elem.value);
    elem.setCustomValidity('');
  } catch (ex) {
    elem.setCustomValidity(ex.message);
  }
}

function renewServerUrlRequirement() {
  const elem = document.getElementById("opt_server.url");
  const required = document.getElementById("opt_capture.saveTo").value === 'server';
  elem.required = required;
}

async function openIndexer() {
  const u = new URL(browser.runtime.getURL("scrapbook/cache.html"));
  const params = u.searchParams;
  if (getOptionFromDocument('indexer.fulltextCache')) {
    params.append('fulltext', 1);
  }
  if (getOptionFromDocument('indexer.fulltextCacheRecreate')) {
    params.append('recreate', 1);
  }
  if (getOptionFromDocument('indexer.createStaticSite')) {
    params.append('static_site', 1);
  }
  params.append('backup', getOptionFromDocument('indexer.makeBackup') ? 1 : '');

  return await scrapbook.visitLink({
    url: u.href,
    newTab: true,
  });
}

async function openChecker() {
  const u = new URL(browser.runtime.getURL("scrapbook/check.html"));
  const params = u.searchParams;
  if (getOptionFromDocument('checker.resolveInvalidId')) {
    params.append('resolve_invalid_id', 1);
  }
  if (getOptionFromDocument('checker.resolveMissingIndex')) {
    params.append('resolve_missing_index', 1);
  }
  if (getOptionFromDocument('checker.resolveMissingIndexFile')) {
    params.append('resolve_missing_index_file', 1);
  }
  if (getOptionFromDocument('checker.resolveMissingDate')) {
    params.append('resolve_missing_date', 1);
  }
  if (getOptionFromDocument('checker.resolveOlderMtime')) {
    params.append('resolve_older_mtime', 1);
  }
  if (getOptionFromDocument('checker.resolveTocUnreachable')) {
    params.append('resolve_toc_unreachable', 1);
  }
  if (getOptionFromDocument('checker.resolveTocInvalid')) {
    params.append('resolve_toc_invalid', 1);
  }
  if (getOptionFromDocument('checker.resolveTocEmptySubtree')) {
    params.append('resolve_toc_empty_subtree', 1);
  }
  if (getOptionFromDocument('checker.resolveUnindexedFiles')) {
    params.append('resolve_unindexed_files', 1);
  }
  if (getOptionFromDocument('checker.resolveAbsoluteIcon')) {
    params.append('resolve_absolute_icon', 1);
  }
  if (getOptionFromDocument('checker.resolveUnusedIcon')) {
    params.append('resolve_unused_icon', 1);
  }
  params.append('backup', getOptionFromDocument('checker.makeBackup') ? 1 : '');

  return await scrapbook.visitLink({
    url: u.href,
    newTab: true,
  });
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

function onOpenIndexerClick(event) {
  event.preventDefault();
  openIndexer();
}

function onOpenCheckerClick(event) {
  event.preventDefault();
  openChecker();
}

async function onSubmit(event) {
  event.preventDefault();

  // verify the form
  refreshForm();

  // save options
  const keys = {};
  const keysToRemove = [];

  for (const key in scrapbook.DEFAULT_OPTIONS) {
    const value = getOptionFromDocument(key);

    // Overwrite only keys with a defined value so that
    // keys not listed in the options page are not nullified.
    // In Chromium, storageArea.set({key: undefined}) does not store to key.
    // In Firefox, storageArea.set({key: undefined}) stores null to key.
    if (typeof value === "undefined") {
      continue;
    }

    // Remove the key if the value is identical to the default, so that the
    // value will be updated if the default value changes in the future.
    if (JSON.stringify(value) === JSON.stringify(scrapbook.DEFAULT_OPTIONS[key])) {
      keysToRemove.push(key);
      continue;
    }

    keys[key] = value;
  }

  await scrapbook.setOptions(keys);
  await scrapbook.clearOptions(keysToRemove);

  return closeWindow();
}

function onResetClick(event) {
  event.preventDefault();
  resetOptions();
  refreshForm();
}

function onExportClick(event) {
  event.preventDefault();
  exportOptions();
}

function onImportClick(event) {
  event.preventDefault();
  document.getElementById("import-input").click();
}

async function onImportInputChange(event) {
  event.preventDefault();
  const file = event.target.files[0];
  event.target.value = null;
  await importOptions(file);
  refreshForm();
}

async function onCloudClick(event) {
  event.preventDefault();
  const u = new URL(browser.runtime.getURL("core/cloud.html"));
  return await scrapbook.visitLink({
    url: u.href,
  });
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

function onTooltipClick(event) {
  event.preventDefault();
  const elem = event.currentTarget;
  toggleTooltip(elem);
}

window.addEventListener("DOMContentLoaded", async (event) => {
  // load languages
  scrapbook.loadLanguages(document);
  document.getElementById("optionServerUrlTooltip").setAttribute('data-tooltip', scrapbook.lang('OptionServerUrlTooltip', [scrapbook.BACKEND_MIN_VERSION]));

  // load default options
  await initOptions();

  // load detail status
  await loadDetailStatus();

  // check permissions and show warning, and update automatically
  await refreshPermissions();

  browser.permissions.onAdded.addListener(refreshPermissions);
  browser.permissions.onRemoved.addListener(refreshPermissions);

  // event handlers
  document.getElementById("opt_capture.saveTo").addEventListener("change", renewCaptureSaveToDetails);
  document.getElementById("opt_capture.saveAs").addEventListener("change", renewCaptureSaveAsDetails);
  document.getElementById("opt_capture.saveFolder").addEventListener("change", verifySaveFolder);
  document.getElementById("opt_capture.saveFilename").addEventListener("change", verifySaveFilename);

  document.getElementById("opt_capture.downLink.file.extFilter").addEventListener("change", verifyDownLinkFileExtFilter);
  document.getElementById("opt_capture.downLink.doc.urlFilter").addEventListener("change", verifyDownLinkDocUrlFilter);
  document.getElementById("opt_capture.downLink.urlFilter").addEventListener("change", verifyDownLinkUrlFilter);

  document.getElementById("opt_capture.helpersEnabled").addEventListener("change", verifyCaptureHelpers);
  document.getElementById("opt_capture.helpers").addEventListener("change", verifyCaptureHelpers);
  document.getElementById("opt_autocapture.enabled").addEventListener("change", verifyAutoCapture);
  document.getElementById("opt_autocapture.rules").addEventListener("change", verifyAutoCapture);

  document.getElementById("opt_capture.saveTo").addEventListener("change", renewServerUrlRequirement);

  document.getElementById("openIndexer").addEventListener("click", onOpenIndexerClick);
  document.getElementById("openChecker").addEventListener("click", onOpenCheckerClick);

  document.getElementById("options").addEventListener("submit", onSubmit);
  document.getElementById("reset").addEventListener("click", onResetClick);
  document.getElementById("export").addEventListener("click", onExportClick);
  document.getElementById("import").addEventListener("click", onImportClick);
  document.getElementById("import-input").addEventListener("change", onImportInputChange);
  document.getElementById("cloud").addEventListener("click", onCloudClick);

  for (const elem of document.querySelectorAll('#optionsWrapper details')) {
    elem.addEventListener("toggle", onDetailsToggle);
  }

  for (const elem of document.querySelectorAll('#optionsWrapper :valid, #optionsWrapper :invalid')) {
    elem.addEventListener("invalid", onInvalid);
  }

  for (const elem of document.querySelectorAll('a[data-tooltip]')) {
    elem.addEventListener("click", onTooltipClick);
  }

  // refresh form
  refreshForm();
});

}));
