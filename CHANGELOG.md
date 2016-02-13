# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

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