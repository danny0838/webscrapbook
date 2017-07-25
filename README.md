*Web ScrapBook* is a browser addon that captures the web page with highly customizable configurations.

A wab page can be saved as:
1. **stream**: A series of downloads. (For Chrome, it's recommended that *"Ask where to save each file before downloading" be unchecked* to avoid tons of prompts.)
2. **htz**: A file format which a webpage as well as its referenced resources are packed in a file using the zip algorithm, with "index.html" being the entry.
3. **maff**: A file format which each webpage as well as its referenced resources are packed into a top sub-directory of a file using the zip algorithm. See [official introduction](http://maf.mozdev.org/index.html) for detail.
4. **single HTML**: A single html file that embeds referenced resources using data URI.

A .htz or .maff archive file can be viewed using "View archive page". It's recommended that *"Allow access to file URLs" be checked* to allow viewing an archive file in the local filesystem directly. (Not supported in Firefox.) Additionally, you can also unzip an archive file and load the entry page with the browser.

This extension is available for Chromium-based browsers (Google Chrome, Opera, Vivaldi, etc), and Firefox for Desktop and Android.


## Caveats:

* A vary large zip archive file (around 2 GiB) cannot be read by the browser. A large file in the zip archive (around 400~500 MiB) can exhaust the memory and crash the extension.

* Javascript in the archive file might not work correctly, especially when it loads an external script or file dynamically. (Firefox is more likely to run into this issue due to more restriction of its addon system.)


## See also:

* [Download Chrome extension in Chrome web store](https://chrome.google.com/webstore/detail/web-scrapbook/oegnpmiddfljlloiklpkeelagaeejfai)
* [Download Firefox addon](https://danny0838.github.io/webscrapbook/files/firefox/latest.html)
* [View project repository](https://github.com/danny0838/webscrapbook)
