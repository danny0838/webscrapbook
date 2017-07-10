*Web ScrapBook* is a browser addon that captures the web page with highly customizable configurations.

A wab page can be saved as:
1. **stream**: A series of downloads. (For Chrome, it's recommended that *"Ask where to save each file before downloading" be unchecked* to avoid tons of prompts.)
2. **htz**: A file format which a webpage as well as its referenced resources are packed in a file using the zip algorithm, with "index.html" being the entry.
3. **maff**: A file format which each webpage as well as its referenced resources are packed into a top sub-directory of a file using the zip algorithm. See [official introduction](http://maf.mozdev.org/index.html) for detail.
4. **single HTML**: A single html file that embeds referenced resources using data URI.

A .htz or .maff can be viewed after unzipping it with a regular compression software supporting zip, or use [Web Archive Viewer](https://github.com/danny0838/webarchiveviewer) or another browser extension or software to view it directly.


## Caveats:

* It's recommended that *"Allow access to file URLs" be checked* in Chrome to allow saving files from the local client. (Not supported in Firefox.)


## See also:

* [Download Chrome extension in Chrome web store](https://chrome.google.com/webstore/detail/web-scrapbook/oegnpmiddfljlloiklpkeelagaeejfai)
* [Download Firefox addon](https://danny0838.github.io/webscrapbook/files/firefox/latest.html)
* [View project repository](https://github.com/danny0838/webscrapbook)
