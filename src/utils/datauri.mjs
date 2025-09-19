/******************************************************************************
 * Data URI related utilities.
 *
 * Mainly separated to prevent loading large `sha1` and `Mime` modules from
 * unrelated scripts.
 *
 * @TODO: Rewrite using dynamic import for better on-demand importing in an
 * appropriate future version.
 * * Firefox < 89: `import()` doesn't work in content script.
 *   ref: https://bugzilla.mozilla.org/show_bug.cgi?id=1536094
 * * Firefox (tested <= 143): `import()` in a content script injected into
 *   `iframe[sandbox]:not([sandbox~="allow-script"])` halts forever.
 *   ref: https://bugzilla.mozilla.org/show_bug.cgi?id=1988419
 * * Chrome (tested <= 140): relative/inter-module importing and source map
 *   loading fail in a content script when `use_dynamic_url` is `true`.
 *   ref: https://crbug.com/444772033
 *****************************************************************************/

import * as scrapbook from "./common.mjs";
import {sha1} from "./sha.mjs";
import * as Mime from "../lib/mime.mjs";

const regexFields = /^data:([^,]*?)(;base64)?,([^#]*)/i;
const regexFieldValue = /^(.*?)=(.*?)$/;
const regexUtf8 = /[^\x00-\x7F]+/g;
const fnUtf8 = m => encodeURIComponent(m);

function dataUriToFile(dataUri, useFilename = true) {
  if (regexFields.test(dataUri)) {
    const mediatype = RegExp.$1;
    const base64 = !!RegExp.$2;

    // browsers treat a non-ASCII char in an URL as a UTF-8 byte sequence
    const data = RegExp.$3.replace(regexUtf8, fnUtf8);

    const parts = mediatype.split(";");
    const mime = parts.shift();
    const parameters = {};
    for (const part of parts) {
      if (regexFieldValue.test(part)) {
        parameters[RegExp.$1.toLowerCase()] = RegExp.$2;
      }
    }

    const bstr = base64 ? atob(data) : unescape(data);
    const ab = scrapbook.byteStringToArrayBuffer(bstr);

    let filename;
    if (useFilename && parameters.filename) {
      filename = decodeURIComponent(parameters.filename);
    } else {
      let ext = parameters.filename && scrapbook.filenameParts(parameters.filename)[1] || Mime.extension(mime);
      ext = ext ? ("." + ext) : "";
      filename = sha1(ab, "ARRAYBUFFER") + ext;
    }

    const file = new File([ab], filename, {type: mediatype});
    return file;
  }
  return null;
}

export {
  dataUriToFile,
};
