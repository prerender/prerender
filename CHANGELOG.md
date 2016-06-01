# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

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
