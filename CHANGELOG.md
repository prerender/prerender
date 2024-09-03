# Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## 5.21.6

- Added `renderErrorStatusCode` to `this.options`. We are returning with this status code in case of rendering error.

## 5.21.5 - 2024-07-10

- Spawn chrome process as a direct descendant of root process, and not through extra shell (this is required for chrome restarts to work properly)

## 5.21.4 - 2024-07-09

- Set PRERENDER_DEBUG_LOG environment variable to enable debug logging
- Logging improvements

## 5.21.2 - 2024-06-28

### Changed

- Add `x-prerender-504-reason` header to response

## 5.21.1 - 2024-05-06

### Changed

- Add `server` object to `connectedToBrowser` event

## 5.21.0 - 2024-05-06

### Changed

- Make `BROWSER_TRY_RESTART_PERIOD` configurable in the server options

## 5.20.4 - 2024-04-18

### Changed

- Fix `extraChromeFlags` option: `TypeError: Assignment to constant variable.`

## 5.20.3 - 2024-04-17

### Changed

- Add `proxyServer` option to allow for a proxy server to be used by Headless Chrome
- Add `extraChromeFlags` option to add additional Chrome flags without overriding the default flags

## 5.20.2 - 2023-03-01

- Add `x-prerender-render-id` and `x-prerender-render-at` meta tags to header

## 5.20.1 - 2022-11-30

### Changed

- Log error if Page.stopLoading fails

## 5.20.0 - 2022-05-06

- If a request made during rendering gets a 5XX response the render process will be marked as dirty

## 5.19.0 - 2022-03-23

- Ability to parse content from the shadow DOM

## 5.18.0 - 2022-02-09

- Fire plugin event `tabNavigated` when tab navigation is finished. Save `errorText` in `tab.prerender.navigateError`
- Mark page done if `navigateError` exists

## 5.17.0 - 2021-12-16

### Changed

- Allow enabling of request and JS logging to console with the `PRERENDER_LOG_REQUESTS` environment variable

## 5.16.5 - 2021-12-08

### Changed

- Fix plugin event logging after reject

## 5.16.4 - 2021-12-06

### Changed

- Logging if the plugin event lasts more than 10 seconds

## 5.16.3 - 2021-11-29

### Changed

- Save if the rendering was timed out in tab.prerender.timedout

## 5.16.2 - 2021-11-26

### Changed

- Add option to skip setting `customElements.forcePolyfill = true`

## 5.16.1 - 2021-10-25

### Changed

- Undefined page outerHTML treated as an error

## 5.16.0 - 2021-09-21

### Changed

- Save errors to tab.prerender.errors

## 5.15.0 - 2021-08-31

### Changed

- Log initial request

## 5.14.0 - 2021-07-26

### Changed

- Ignore EventSource requests when counting the number of requests in flight

## 5.13.1 - 2021-06-21

### Changed

- Fix wait for connect call

## 5.13.0 - 2021-06-21

### Changed

- Retry CDP websocket connection.

## 5.12.0 - 2021-06-04

### Changed

- Upgraded `chrome-remote-interface` from `0.28.x` to `0.30.0`.

## 5.11.3 - 2021-06-04

### Changed

- We didn't wait some promises like `setUserAgentOverride`, `setBypassServiceWorker` and `setOverrideCertificateErrors` in the past. Under heavy load, we might send requests before these overrides are set properly.

## 5.11.2 - 2021-06-04

### Added

- `prerenderReadyDelay` now can be configured via `req.prerender.prerenderReadyDelay`

## 5.11.1 - 2021-06-03

### Changed

- fix: `firstPrerenderReadyTime` should be evulated in each rendering process, not only the first rendering

## 5.11.0 - 2021-05-20

### Changed

- stop rendering after `prerenderReady` set to true.

## 5.10.0 - 2021-05-06

### Added

- modified the `checkIfPageIsDoneLoading` function to stop checking the page status if we received a redirect.

## 5.9.0 - 2021-04-28

### Added

- added `timeoutStatusCode` to `tab.prerender` and to `this.options`. We are returning with this status code if a page won't load in `pageLoadTimeout`.

## 5.8.0 - 2020-07-27

### Added

- added `timeSpentConnectingToBrowser`, `timeSpentOpeningTab`, `timeSpentLoadingUrl`, `timeSpentParsingPage`, `timeUntilError` to `req.prerender` to allow for debugging of certain issues with the server spending too much time in different lifecycle sections
- added a fix to setHeader warning by splitting headers on any line returns

## 5.7.0 - 2020-07-24

### Changed

- added ability to configure the chrome remote debugging port for running more than one instance of chrome on the same server
- added automatic closing of browser alert dialogs
- moved some code from responseReceived down to loadingFinished to help more accurately know when content is done downloading
- removed the deletion of some CSP headers that weren't really causing any issues

## 5.6.0 - 2019-03-27

### Changed

- added configurable options for pdf printing to let you override all options necessary using `this.options.pdfOptions`
- fixed timeouts on redirects
- added ability to override other express options on the `.listen()` function by passing in an object now instead of just the port

## 5.5.1 - 2019-02-06

### Changed

- We were relying on `document.doctype` to return the full doctype string but that string changed in Chrome v72. We now parse the full doctype object directly in order to build the proper doctype and this change is backwards compatible with older Chrome versions.

## 5.5.0 - 2019-02-06

### Added

- Added `domContentEventFired` so that `checkIfPageIsDoneLoading` will wait at least for `domContentEventFired` before also waiting for all network requests to finish. This should hopefully take care of any edge cases where a page is saved too early when Chrome doesn't send new network requests during the parsing of a large .js file.

## 5.4.5 - 2018-12-04

### Changed

- fixed issue with creating browser tabs in a new context (to clear cookies/local storage)
- `LOG_REQUESTS` shows console logging from the webpage being loaded
- fixed `this.options.followRedirect` typo to now be `this.options.followRedirects`

## 5.4.4 - 2018-08-07

### Changed

- Updated Mocha to 5.2.0, Sinon to 6.1.4 and a few minor package numbers
- Added package-lock.json

## 5.4.3 - 2018-08-07

### Changed

- Removed a check for success in the response of `Target.disposeBrowserContext` to fix an issue with Chrome 68 removing that response object.

## 5.4.2 - 2018-04-05

### Changed

- Removed the `Page.addScriptToEvaluateOnNewDocument({source: 'localStorage.clear()'})` since it seemed to be causing an issue with Chrome in some cases. Going to look for a better fix here since our context should be clearing this already.

## 5.4.1 - 2018-04-05

### Changed

- For checking if a URL returns a redirect, we were checking to see if the request returning the redirect URL matched which failed in some cases where the encoding of the URL was different in the request. That code now checks the request ID to see if it matches the original request.
- Service worker enable/disable can be enabled/disabled on a per tab basis by setting `req.prerender.enableServiceWorker` in the `requestReceived` event.

## 5.4.0 - 2018-04-04

### Changed

- Added ability to turn on/off services workers.

## 5.3.1 - 2018-03-09

### Added

- Added `this.isBrowserConnected = false` inside `server.restartBrowser()` so the prerender server won't try to render any new requests before the browser is actually restarted. Fixes a very small edge case at scale.

## 5.3.0 - 2018-03-09

### Added

- Added `localStorage.clear()` on a new page being loaded due to bug in BrowserContext local storage being cleared: https://bugs.chromium.org/p/chromium/issues/detail?id=754576

### Changed

- Changed `document.getElementsByTagName('html')[0].outerHTML` to `document.firstElementChild.outerHTML` when querying page `html` to improve performance.

## 5.2.2 - 2018-02-02

### Changed

- Make sure we only call `Buffer.byteLength` on a string to fix an error in newer versions of Node

## 5.2.1 - 2018-01-29

### Changed

- Changed `request.loaderId` to `request.requestId` in `requestWillBeSent` due to issue with Chrome 64 changing loaderId format.

## 5.2.0 - 2017-12-08

### Added

- Added ability for the prerender server to restart Chrome due to some connection issues we've been seeing after a server is running for a few hours.

## 5.1.1 - 2017-12-08

### Changed

- Chrome re-uses the original request ID on a redirect so we are saving off the fact that we saw a redirect to make sure we return a correct 301
- Changed dependencies from ^ to ~ to make the semver more specific

## 5.1.0 - 2017-12-06

### Added

- Added removal of `<link rel="import" src="">` tags after the page is done loading to the `removeScriptTags` plugin. Imported HTML can have script tags in it, and since it's already been rendered to the page we can safely remove it when running that plugin.

## 5.0.3 - 2017-11-29

### Added

- Added `if (window.customElements) customElements.forcePolyfill = true`, `ShadyDOM = {force: true}`, and `ShadyCSS = {shimcssproperties: true}` to fix Polymer app rendering.

## 5.0.2 - 2017-11-20

### Changed

- Added back `res.setHeader` for plugins to use

## 5.0.1 - 2017-11-15

### Changed

- Set `renderType` to `html` for non "/render" endpoint

## 5.0.0 - 2017-11-15

### Added

- Added Headless Chrome as a rendering engine!
- Added new event types: `requestReceived`, `tabCreated`, `pageLoaded`.
- Added new Prerender server option: `chromeLocation`
- Added ability to request jpg and png screenshots
- Added ability to request pdf export of a page
- Added ability to request HAR file of page load times

### Changed

- Removed PhantomJS and all references to it
- Removed old event types: `beforePhantomRequest`, `onPhantomPageCreate`, `afterPhantomRequest`, `beforeSend`
- Removed In Memory Cache (moved to new repo)
- Removed S3 HTML Cache (moved to new repo)
- Removed Prerender server options that are no longer needed: `workers`, `iterations`, `softIterations`, `cookiesEnabled`, `pageDoneCheckTimeout`, `resourceDownloadTimeout`, `jsTimeout`, `noJsExecutionTimeout`, `evaluateJavascriptCheckTimeout`

See the Readme.me for in depth descriptions of all of the new changes!

## 4.4.1 - 2016-12-28

### Changed

- Whoops. Make sure `shouldEncodeURLBeforeBrowserFetch` defaults to true.

## 4.4.0 - 2016-12-28

### Added

- Added `shouldEncodeURLBeforeBrowserFetch` to allow projects that use prerender to determine whether they want to call `encodeURI` on the URL before fetching it in PhantomJS. Useful for some URLs that might have encoded slashes in them, since encoding them further would cause incorrect behavior.

## 4.3.1 - 2016-08-25

### Changed

- Fixed issue where PhantomJS crashed and then disposing caused bad phantomjs state

## 4.3.0 - 2016-08-04

### Changed

- Bumped all dependency versions to latest

## 4.2.0 - 2016-08-04

### Added

- Added ability for cluster master to kill last known phantomjs pid for a worker if the worker dies (preventing orphaned phantomjs instances)

### Changed

- Better terminating for cluster workers

## 4.1.0 - 2016-07-27

### Added

- Added NUM_SOFT_ITERATIONS to try to kill phantomjs and reclaim memory when no requests are in flight. This should be set to a low number (1-10) so that PhantomJS can be restarted often when it isn't doing anything else. NUM_ITERATIONS should still be set to something like 40-50 to make sure to force kill PhantomJS even if a request is in flight.
- Added clearing of memory cache to prevent PhantomJS from returning a 304

### Changed

- Fixed issue where prerender-status-code set to `200` was causing the page to skip being cached
- Fixed an issue where we weren't using the correct pid when trying to force kill PhantomJS.
- Moved clearing of memory cache and local storage to before the page loads instead of after. This will prevent edge cases that could cause a 304.

## 4.0.10 - 2016-06-01

### Changed

- Fixed issue where S3HtmlCache was calling next() before finishing saving to the cache

## 4.0.9 - 2016-05-08

### Changed

- Fixed issue where we were calling `hasOwnProperty` on a `querystring` that no longer had Object on it's prototype chain

## 4.0.8 - 2016-03-24

### Changed

- Fixed issue where a webpage calling window.close would cause Prerender to be unable to shutdown PhantomJS properly

## 4.0.7 - 2016-03-22

### Changed

- S3 cache plugin was incorrectly saving non-200 status code responses to the cache

## 4.0.6 - 2016-03-09

### Changed

- preserve phantom arguments when server is restarting
- use default when phantomArguments is empty

## 4.0.5 - 2016-02-29

### Changed

- prevent multiple phantomjs instances from being started with low number of iterations
- try to check to see if phantomjs has actually been disposed. if not, force kill it.

## 4.0.4 - 2016-02-18

### Changed

- added engines to package.json and fixed possible bug in checking options passed in
- prevent weird hangup on error setting a header with a newline
- make sure we catch any errors thrown from phridge and continue
- kill workers (and phantomjs) on SIGTERM

## 4.0.3 - 2016-02-12

### Added plugin to send a header of X-Prerender: 1 with every request

## 4.0.2 - 2016-02-12

#### Now using PhantomJS version 2.1

### Changed

- Changed `PHANTOM_CLUSTER_NUM_WORKERS` to `PRERENDER_NUM_WORKERS` in server.js
- Changed `PHANTOM_WORKER_ITERATIONS` to `PRERENDER_NUM_ITERATIONS` in server.js
- Switched from `phantomjs-node` bridge to `phridge`
- All Prerender plugins that access PhantomJS need to be rewritten to support new [phridge](https://github.com/peerigon/phridge) integration.
  For example, change this:

```
req.prerender.page.set('onConsoleMessage', function(msg) {
    console.log(msg);
});
```

to this:

```
req.prerender.page.run(function() {

	this.onConsoleMessage = function(msg) {
           console.log(msg);
       };
});
```

Please see [phridge](https://github.com/peerigon/phridge) for more info on how to interact with PhantomJS through `phridge`.

###Removed

- Removed `PHANTOM_CLUSTER_BASE_PORT` since `phridge` doesn't start a webserve to talk to PhantomJS, so it's no longer needed.
- Removed `PHANTOM_CLUSTER_MESSAGE_TIMEOUT` since `phridge` doesn't start a webserve to talk to PhantomJS, so it's no longer needed.
