*Web ScrapBook* is a browser addon that captures the web page with highly customizable configurations.

A wab page can be saved as a folder, a single HTML file, or a zip-packed archive file (.htz or .maff). An archive file can be viewed via the built-in "View archive page" feature (it's recommended that *"Allow access to file URLs" be checked* to allow viewing an archive file in the local filesystem directly), or by opening the entry page after unzipping.

This extension is available for Chromium-based browsers (Google Chrome, Opera, Vivaldi, etc), and Firefox for Desktop and Android.


## Caveats:
* Restrictions in Firefox:
  * Most functionalities are not supported in Private Window.
  * "Allow access to file URLs" is not supported.
* A vary large zip archive file (around 2 GiB) cannot be read by the browser. A large file in the zip archive (around 400~500 MiB) can exhaust the memory and crash the extension.
* Javascript in the archive file might not work correctly, especially when it loads an external script or file dynamically. (Firefox is more likely to run into this issue due to more restriction of its addon framework.)


## See also:

* [Download Chrome extension in Chrome web store](https://chrome.google.com/webstore/detail/web-scrapbook/oegnpmiddfljlloiklpkeelagaeejfai)
* [Download Firefox addon](https://danny0838.github.io/webscrapbook/files/firefox/latest.html)
* [View project repository](https://github.com/danny0838/webscrapbook)
