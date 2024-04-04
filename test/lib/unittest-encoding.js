function escapeHtml(str) {
  return str.replace(/[&#%]/g, m => escape("&#x" + m.charCodeAt(0).toString(16) + ";"));
}
const text = escapeHtml(document.currentScript.dataset.text);
const a = document.createElement("a");
a.href = "https://example.com/?" + text;
parent.postMessage(a.search.slice(1), "*");
