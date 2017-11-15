*Web ScrapBook* is a browser addon that captures the web page with highly customizable configurations.

A wab page can be saved as a folder, a single HTML file, a scripted single HTML file, or a zip-packed archive file (.htz or .maff). An archive file can be viewed via the built-in archive page viewer (it's recommended that *"Allow access to file URLs" be checked* to allow viewing directly from the file manager), or by opening the entry page after unzipping.

Besides, a site indexer is also built in and can be used to generate a static site of the captured web pages.

This extension is available for Chromium-based browsers (Google Chrome, Opera, Vivaldi, etc), and Firefox for Desktop and Android.


## Caveats:
* JavaScript and embedded objects in a captured web page may not work correctly and can cause a security risk. This risk is even higher if the page is viewed using the archive page viewer, as they are run in a privileged environment. Related options are all off by default. Use them very carefully and at your own risk.
* For Firefox:
  * Capturing a web page that requires login in a private window may get an incorrect result.
  * The GUI may not work well when viewing an maff archive with multiple pages in a private window.
  * "Allow access to file URLs", which allows the browser to open and view a local archive page directly, is currently not supported in Firefox.
* For Chrome:
  * An archive page in a frame cannot be viewed via the archive page viewer directly due to an unfixed bug.
* A vary large zip archive file (around 2 GiB) cannot be read by the browser. A large file in the zip archive (around 400~500 MiB) can exhaust the memory and crash the extension.


## See also:

* [Download Chrome extension in Chrome web store](https://chrome.google.com/webstore/detail/web-scrapbook/oegnpmiddfljlloiklpkeelagaeejfai)
* [Download Firefox addon in AMO](https://addons.mozilla.org/firefox/addon/web-scrapbook/)
* [View project repository](https://github.com/danny0838/webscrapbook)
