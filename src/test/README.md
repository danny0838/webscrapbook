# Tests

## System requirements

* [Node.js](https://nodejs.org)
* [Python](https://www.python.org) ≥ 3.7 (Optional)
* [PyWebScrapBook](https://github.com/danny0838/PyWebScrapBook) (Optional)

## Running tests

1. Run `npm run dev:<browser>` to prepare development for specific browser.

2. Install WebScrapBook extension (standard install or as a temporary extension).

3. Click on the action of the extension and choose `Tests` to select the tests to run.

### End-to-end capture tests

1. Install PyWebScrapBook and configure related extension options.

2. Copy `config.json` to `config.local.json` and make sure `server_port`, `server_port2`, and `backend_port` are available (not used by other applications).

3. Tweak WebScrapBook option `Backend server > Address` to match `http://localhost:<backend_port>/`

4. Run `server.py` to start the local hosting server.

5. Run capture tests.

6. Do the same tests in a private window for Firefox (which may behave differently from in a normal window).

### External messaging tests

1. Install the external test extension from `src/test/external` (as a temporary extension).

2. Copy `config.json` to `config.local.json` and make sure `extension_id` matches the installed external test extension.

3. Run external messaging tests.

## Notes

* It's recommended to use a different user account or profile of the browser, or use another build of browser (such as Firefox Developer Edition) for tests.

* Tests may fail due to several unclear issues of the browser. Here are some hints for further investigation:
  * **Run tests repeatedly**: varying fails/errors suggest there's an issue of the browser or somewhere rather than the extension itself.
  * **Clear browser cache**: to avoid fails due to retrieving outdated testing page content.
  * **Use clean profile**: in Chromium, tests could get repeatedly fail for a long living user account, and shifting to another user resolves it. In Firefox, this can resolve a profile issue after version change.
