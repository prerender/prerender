var phridge = require('phridge')
  , _ = require('lodash')
  , util = require('./util.js')
  , zlib = require('zlib')
  , blockedResources = require('./resources/blocked-resources.json');

var COOKIES_ENABLED = process.env.COOKIES_ENABLED || false;

var PAGE_DONE_CHECK_TIMEOUT = process.env.PAGE_DONE_CHECK_TIMEOUT || 300;

var RESOURCE_DOWNLOAD_TIMEOUT = process.env.RESOURCE_DOWNLOAD_TIMEOUT || 10 * 1000;

var WAIT_AFTER_LAST_REQUEST = process.env.WAIT_AFTER_LAST_REQUEST || 500;

var JS_CHECK_TIMEOUT = process.env.JS_CHECK_TIMEOUT || 300;

var JS_TIMEOUT = process.env.JS_TIMEOUT || 10 * 1000;

var NO_JS_EXECUTION_TIMEOUT = process.env.NO_JS_EXECUTION_TIMEOUT || 3000;

var EVALUATE_JAVASCRIPT_CHECK_TIMEOUT = process.env.EVALUATE_JAVASCRIPT_CHECK_TIMEOUT || 300;

var NUM_ITERATIONS = process.env.NUM_ITERATIONS || 40;

var NUM_SOFT_ITERATIONS = process.env.NUM_SOFT_ITERATIONS || 30;

var server = exports = module.exports = {};

server.init = function(options) {
    this.plugins = this.plugins || [];
    this.options = options;

    return this;
};

server.start = function() {
    if(!this.options.isMaster) {
        this.createPhantom();
    }
};

server.use = function(plugin) {
    this.plugins.push(plugin);
    if (typeof plugin.init === 'function') plugin.init(this);
};

server._pluginEvent = function(methodName, args, callback) {
    var _this = this
      , index = 0
      , next;

    next = function() {
        var layer = _this.plugins[index++];
        if (!layer) return callback();

        var method = layer[methodName];

        if (method) {
            method.apply(layer, args);
        } else {
            next();
        }
    };

    args.push(next);
    next();
};

server.createPhantom = function() {
    var _this = this;

    var args = {'--load-images': false, '--ignore-ssl-errors': true, '--ssl-protocol': 'tlsv1.2'};

    if(this.options.phantomArguments && !_.isEmpty(this.options.phantomArguments)) {
        args = _.clone(this.options.phantomArguments);
    }

    util.log('starting phantom...');

    if(this.options.onStdout) {
      phridge.config.stdout = this.options.onStdout;
    }

    if(this.options.onStderr) {
      phridge.config.stderr = this.options.onStderr;
    }

    phridge.spawn(args).then(_.bind(_this.onPhantomCreate, _this));
};

server.onPhantomCreate = function(phantom) {
    var _this = this;

    util.log('started phantom');
    this.phantom = phantom;
    this.phantom.id = Math.random().toString(36);
    this.phantom.requestsInFlight = 0;
    this.phantom.iteration = 0;

    //send the current phantomjs pid to the cluster master in order to make sure phantomjs is properly killed if this worker dies
    process.send({phantomjsPid: this.phantom.childProcess.pid});

    this.phantom.on('unexpectedExit', function(err) {
        util.log('phantom crashed, restarting...');

        function restartPhantom() {
            process.nextTick(_.bind(_this.createPhantom, _this));
        }

        _this._disposeAll(restartPhantom);
    });
};

server.onRequest = function(req, res) {
    var _this = this;

    // Create a partial out of the _send method for the convenience of plugins
    res.send = _.bind(this._send, this, req, res);

    req.prerender = {
        url: util.getUrl(req),
        start: new Date()
    };

    util.log('getting', req.prerender.url);

    this._pluginEvent("beforePhantomRequest", [req, res], function() {
        _this.createPage(req, res);
    });
};

server.createPage = function(req, res) {
    var _this = this;

    if(!this.phantom) {
        setTimeout(function(){
            _this.createPage(req, res);
        }, 50);
    } else {
        req.prerender.phantomId = this.phantom.id;
        req.prerender.page = this.phantom.createPage();

        this.phantom.requestsInFlight++;
        this.onPhantomPageCreate(req, res);
    }
};

server.onPhantomPageCreate = function(req, res) {
    var _this = this;

    req.prerender.stage = 0;
    req.prerender.pendingRequests = 0;

    this.phantom.run((req.prerender.cookiesEnabled || _this.options.cookiesEnabled || COOKIES_ENABLED), function(cookiesEnabled) {
        this.cookiesEnabled = cookiesEnabled;
    });

    if(req.prerender.isPageClosed) {
        return res.send(504);
    }

    this.clearLocalStorage(req, res);
    this.clearMemoryCache(req, res);

    req.prerender.page.run(_this.options.blockedResources || blockedResources, !!_this.options.logRequests, function(blockedResources, logRequests, resolve, reject) {

        var _this = this;
        this.prerender = {
            resourcesRequested: [],
            resourcesReceived: [],
            resourcesTimeout: [],
            lastResourceReceived: null
        };

        this.onResourceRequested = function(requestData, request) {
            for(var i = 0,l = blockedResources.length; i < l; i++) {
                var regex = new RegExp(blockedResources[i], 'gi');
                if(regex.test(requestData.url)) {
                    request.abort();
                    requestData.aborted = true;
                    break;
                }
            }

            if(!requestData.aborted) {
                _this.prerender.resourcesRequested.push(requestData);

                if(logRequests) {
                    console.log(new Date().toISOString(), '+', _this.prerender.resourcesRequested.length - _this.prerender.resourcesReceived.length - _this.prerender.resourcesTimeout.length, requestData.url);
                }
            }
        };

        this.onResourceReceived = function(response) {
            _this.prerender.lastResourceReceived = new Date();


            if(response.id === 1) {
                _this.prerender.headers = response.headers;
                _this.prerender.statusCode = response.status;
                _this.prerender.redirectURL = response.redirectURL;
            }

            if ('end' === response.stage) {
                if(response.url) {
                    _this.prerender.resourcesReceived.push(response);

                    if(logRequests) {
                        console.log(new Date().toISOString(), '-', _this.prerender.resourcesRequested.length - _this.prerender.resourcesReceived.length - _this.prerender.resourcesTimeout.length, response.url);
                    }
                }

                if (response.id === 1) {
                    _this.prerender.statusCode = response.status;
                }
            }
        };

        this.onResourceTimeout = function(request) {
            if(request.url) {
                _this.prerender.resourcesTimeout.push(request);
            }
        }

        this.onResourceError = function(resourceError) {
            if(resourceError.url && logRequests) {
                console.log('error loading URL:', JSON.stringify(resourceError));
            }
        }

        this.viewportSize = { width: 1440, height: 718 };
        this.settings.userAgent = this.settings.userAgent + ' Prerender (+https://github.com/prerender/prerender)';

        resolve();

    });

    req.prerender.page.run(function(resolve) {
        this.onClosing = function() {
            resolve(true);
        };
    }).then(function(isPageClosed) {
        req.prerender.isPageClosed = isPageClosed;
    });

    // Fire off a middleware event, then download all of the assets
    _this._pluginEvent("onPhantomPageCreate", [_this.phantom, req, res], function() {
        req.prerender.downloadStarted = req.prerender.lastResourceReceived = new Date();

        req.prerender.downloadChecker = setInterval(function() {
            _this.checkIfPageIsDoneLoading(req, res);
        }, (req.prerender.pageDoneCheckTimeout || _this.options.pageDoneCheckTimeout || PAGE_DONE_CHECK_TIMEOUT));

        if(req.prerender.isPageClosed) {
            return res.send(504);
        }

        var urlToFetch = req.prerender.url;
        if(_this.shouldEncodeURLBeforeBrowserFetch(req)) {
          urlToFetch = encodeURI(req.prerender.url).replace('%2523', '%23')
        }

        req.prerender.page.run(urlToFetch, function(url, resolve, reject) {

            this.open(url, function(status) {
                resolve(status);
            });
        }).then(function(status) {
            req.prerender.status = status;
        });
    });
};

// Called occasionally to check if a page is completely loaded
server.checkIfPageIsDoneLoading = function(req, res) {
    var _this = this;

    if(req.prerender.stage >= 2) return;

    if (!this.phantom || this.phantom.id !== req.prerender.phantomId) {
        util.log('PhantomJS restarted in the middle of this request. Aborting...')
        clearInterval(req.prerender.downloadChecker);
        req.prerender.downloadChecker = null;
        return res.send(504);
    }

    if(req.prerender.isPageClosed) {
        util.log('PhantomJS page was closed in the middle of this request. Aborting...')
        clearInterval(req.prerender.downloadChecker);
        req.prerender.downloadChecker = null;
        return res.send(504);
    }

    req.prerender.page.run(function(resolve) {
        resolve(this.prerender);

    }).then(function(response) {
        req.prerender.pendingRequests = response.resourcesRequested.length - response.resourcesReceived.length - response.resourcesTimeout.length;
        req.prerender.lastResourceReceived = new Date(response.lastResourceReceived);
        req.prerender.headers = response.headers;
        req.prerender.statusCode = response.statusCode;
        req.prerender.redirectURL = response.redirectURL;

        var match = _.find(req.prerender.headers, { name: 'Location' });
        if (match) {
            req.prerender.redirectURL = util.normalizeUrl(match.value);
        }

        if(req.prerender.statusCode && req.prerender.statusCode >= 300 && req.prerender.statusCode <= 399) {
            // Finish up if we got a redirect status code
            clearInterval(req.prerender.downloadChecker);
            req.prerender.downloadChecker = null;

            if(req.prerender.stage >= 2) return;
            return res.send(req.prerender.statusCode);
        }

        var timedOut = new Date().getTime() - req.prerender.downloadStarted.getTime() > (req.prerender.resourceDownloadTimeout || _this.options.resourceDownloadTimeout || RESOURCE_DOWNLOAD_TIMEOUT)
          , timeSinceLastRequest = new Date().getTime() - req.prerender.lastResourceReceived.getTime();

        if(req.prerender.status === 'fail' && !_this.overridePageFailure(req)) {
            clearInterval(req.prerender.downloadChecker);
            req.prerender.downloadChecker = null;

            req.prerender.statusCode = 504;
            return res.send(req.prerender.statusCode);
        }

        // Check against the current stage to make sure we don't finish more than
        // once, and check against a bunch of states that would signal finish - if
        // resource downloads have timed out, if the page has errored out, or if
        // there are no pending requests left
        if(req.prerender.stage < 1 && (req.prerender.status !== null && req.prerender.pendingRequests <= 0 && (timeSinceLastRequest > (req.prerender.waitAfterLastRequest || _this.options.waitAfterLastRequest || WAIT_AFTER_LAST_REQUEST)) || timedOut)) {
            req.prerender.stage = 1;
            clearInterval(req.prerender.downloadChecker);
            req.prerender.downloadChecker = null;
            req.prerender.downloadFinished = new Date();

            req.prerender.timeoutChecker = setInterval(_.bind(_this.checkIfJavascriptTimedOut, _this, req, res), (req.prerender.jsCheckTimeout || _this.options.jsCheckTimeout || JS_CHECK_TIMEOUT));
            _this.evaluateJavascriptOnPage(req, res);
        }
    }).catch(function(err) {
        console.log(err);
    });
};

// sometimes older versions of phantomjs would report a "fail" for a page even though the page still loaded correctly.
// this is to let you override that failure and just continue on based on URL pattern or anything like that
server.overridePageFailure = function(req) {
    return false;
};

// this is to let you override the encodeURI before fetching with PhantomJS.
// useful for cases where you might want to allow certain encoded slashes in the url
server.shouldEncodeURLBeforeBrowserFetch = function(req) {
    return true;
};

// Checks to see if the execution of javascript has timed out
server.checkIfJavascriptTimedOut = function(req, res) {

    var timeout = new Date().getTime() - req.prerender.downloadFinished.getTime() > (req.prerender.jsTimeout || this.options.jsTimeout || JS_TIMEOUT);
    var lastJsExecutionWasLessThanTwoSecondsAgo = req.prerender.lastJavascriptExecution && (new Date().getTime() - req.prerender.lastJavascriptExecution.getTime() < 2000);
    var noJsExecutionInFirstSecond = !req.prerender.lastJavascriptExecution && (new Date().getTime() - req.prerender.downloadFinished.getTime() > (req.prerender.noJsExecutionTimeout || this.options.noJsExecutionTimeout || NO_JS_EXECUTION_TIMEOUT));

    if (!this.phantom || this.phantom.id !== req.prerender.phantomId) {
        util.log('PhantomJS restarted in the middle of this request. Aborting...');
        clearInterval(req.prerender.timeoutChecker);
        req.prerender.timeoutChecker = null;

        res.send(504);

    } else if (timeout && lastJsExecutionWasLessThanTwoSecondsAgo) {
        util.log('Timed out. Sending request with HTML on the page');
        clearInterval(req.prerender.timeoutChecker);
        req.prerender.timeoutChecker = null;

        this.onPageEvaluate(req, res);
    } else if ((timeout && req.prerender.stage < 2) || noJsExecutionInFirstSecond) {
        util.log('Experiencing infinite javascript loop. Killing phantomjs...');
        clearInterval(req.prerender.timeoutChecker);
        req.prerender.timeoutChecker = null;

        res.send(504, {abort: true});
    }
};

// Evaluates the javascript on the page
server.evaluateJavascriptOnPage = function(req, res) {
    var _this = this;

    if(req.prerender.stage >= 2) return;

    if(req.prerender.isPageClosed) {
        clearInterval(req.prerender.timeoutChecker);
        req.prerender.timeoutChecker = null;
        return res.send(504);
    }

    req.prerender.page.run(function(resolve, reject) {

        var obj = this.evaluate(function() {
            try {
                var doctype = ''
                  , html = document && document.getElementsByTagName('html');

                if(document.doctype) {
                    doctype = "<!DOCTYPE "
                         + document.doctype.name
                         + (document.doctype.publicId ? ' PUBLIC "' + document.doctype.publicId + '"' : '')
                         + (!document.doctype.publicId && document.doctype.systemId ? ' SYSTEM' : '')
                         + (document.doctype.systemId ? ' "' + document.doctype.systemId + '"' : '')
                         + '>';
                }

                if (html && html[0]) {
                    return {
                        html: doctype + html[0].outerHTML,
                        shouldWaitForPrerenderReady: typeof window.prerenderReady === 'boolean',
                        prerenderReady: window.prerenderReady
                    };
                }

            } catch (e) { }

            return {
                html: '',
                shouldWaitForPrerenderReady: false,
                prerenderReady: window.prerenderReady
            }

        });

        resolve(obj);

    }).then(function(obj) {
        // Update the evaluated HTML
        req.prerender.documentHTML = obj.html;
        req.prerender.lastJavascriptExecution = new Date();

        if(!obj.shouldWaitForPrerenderReady || (obj.shouldWaitForPrerenderReady && obj.prerenderReady)) {
            clearInterval(req.prerender.timeoutChecker);
            req.prerender.timeoutChecker = null;

            _this.onPageEvaluate(req, res);
        } else {
            setTimeout(_.bind(_this.evaluateJavascriptOnPage, _this, req, res), (req.prerender.evaluateJavascriptCheckTimeout || _this.options.evaluateJavascriptCheckTimeout || EVALUATE_JAVASCRIPT_CHECK_TIMEOUT));
        };
    }).catch(function(err) {
        util.log('error evaluating javascript', err);
        setTimeout(_.bind(_this.evaluateJavascriptOnPage, _this, req, res), (req.prerender.evaluateJavascriptCheckTimeout || _this.options.evaluateJavascriptCheckTimeout || EVALUATE_JAVASCRIPT_CHECK_TIMEOUT));
    });
};

// Called when we're done evaluating the javascript on the page
server.onPageEvaluate = function(req, res) {

    if(req.prerender.stage >= 2) return;

    req.prerender.stage = 2;

    if (!req.prerender.documentHTML) {
        res.send(req.prerender.statusCode || 404);
    } else {
        this._pluginEvent("afterPhantomRequest", [req, res], function() {
            res.send(req.prerender.statusCode || 200);
        });
    }
};

server.clearLocalStorage = function(req, res) {
    if(!req.prerender.page || req.prerender.isPageClosed) {
        return;
    }

    req.prerender.page.run(function() {
        try {
            if(localStorage && typeof localStorage.clear == 'function') {
                localStorage.clear();
            }
        } catch (e) {}
    });
};

server.clearMemoryCache = function(req, res) {
    if(!req.prerender.page || req.prerender.isPageClosed) {
        return;
    }

    req.prerender.page.run(function() {
        try {
            if(this.clearMemoryCache && typeof this.clearMemoryCache == 'function') {
                this.clearMemoryCache();
            }
        } catch (e) {}
    });
};

server._send = function(req, res, statusCode, options) {
    var _this = this;

    if(req.prerender.page) {
        req.prerender.page.dispose().then(function() {
            req.prerender.page = null;
        });
    }
    req.prerender.stage = 2;

    req.prerender.documentHTML = options || req.prerender.documentHTML;
    req.prerender.statusCode = statusCode || req.prerender.statusCode;

    if(req.prerender.statusCode) {
        req.prerender.statusCode = parseInt(req.prerender.statusCode);
    }

    if (options && typeof options === 'object' && !Buffer.isBuffer(options)) {
        req.prerender.documentHTML = options.documentHTML;
        req.prerender.redirectURL = options.redirectURL;
    }

    this._pluginEvent("beforeSend", [req, res], function() {

        if (req.prerender.headers && req.prerender.headers.length) {
            req.prerender.headers.forEach(function(header) {
                try {
                    res.setHeader(header.name, header.value);
                } catch(e) {
                    util.log('unable to set header:', header.name);
                }
            });
        }

        if (req.prerender.redirectURL && !(_this.options.followRedirect || process.env.FOLLOW_REDIRECT)) {
            res.setHeader('Location', req.prerender.redirectURL);
        }

        res.setHeader('Content-Type', 'text/html;charset=UTF-8');

        if(req.headers['accept-encoding'] && req.headers['accept-encoding'].indexOf('gzip') >= 0) {
            res.setHeader('Content-Encoding', 'gzip');
            zlib.gzip(req.prerender.documentHTML, function(err, result) {
                req.prerender.documentHTML = result;
                _this._sendResponse.apply(_this, [req, res, options]);
            });
        } else {
            res.removeHeader('Content-Encoding');
            _this._sendResponse.apply(_this, [req, res, options]);
        }
    });
};

server._sendResponse = function(req, res, options) {

    if (req.prerender.documentHTML) {
        if(Buffer.isBuffer(req.prerender.documentHTML)) {
            res.setHeader('Content-Length', req.prerender.documentHTML.length);
        } else {
            res.setHeader('Content-Length', Buffer.byteLength(req.prerender.documentHTML, 'utf8'));
        }
    }

    if (!req.prerender.documentHTML) {
        res.removeHeader('Content-Length');
    }

    //if the original server had a chunked encoding, we should remove it since we aren't sending a chunked response
    res.removeHeader('Transfer-Encoding');
    //if the original server wanted to keep the connection alive, let's close it
    res.removeHeader('Connection');
    //getting 502s for sites that return these headers
    res.removeHeader('X-Content-Security-Policy');
    res.removeHeader('Content-Security-Policy');

    res.writeHead(req.prerender.statusCode || 504);

    if (req.prerender.documentHTML) res.write(req.prerender.documentHTML);

    res.end();

    if(req.prerender.phantomId && this.phantom && this.phantom.id === req.prerender.phantomId) {
        this.phantom.requestsInFlight--;
    }

    var ms = new Date().getTime() - req.prerender.start.getTime();
    util.log('got', req.prerender.statusCode, 'in', ms + 'ms', 'for', req.prerender.url);

    if(this.shouldKillPhantomJS(req) || (options && options.abort)) {
        req.prerender.isPageClosed = true;
        server._killPhantomJS();
    }
};

server.shouldKillPhantomJS = function(req) {
    if(!this.phantom || this.phantom.id !== req.prerender.phantomId) {
        return false;
    }

    ++this.phantom.iteration;

    if(this.phantom.iteration >= (this.options.iterations || NUM_ITERATIONS)) {
        return true;
    }

    if(this.phantom.iteration >= (this.options.softIterations || NUM_SOFT_ITERATIONS) && this.phantom.requestsInFlight <= 0) {
        return true;
    }

    return false;
}

server._killPhantomJS = function() {
    var _this = this;

    function restartPhantom() {
        util.log("phantomjs terminated");
        process.nextTick(_.bind(_this.createPhantom, _this));
    }

    this._disposeAll(restartPhantom);
};

//Check and see if PhantomJS didn't get disposed so we can forcefully kill it
server._disposeAll = function(callback) {

    var _this = this
      , disposed = false
      , phantomPid = this.phantom && this.phantom.childProcess && this.phantom.childProcess.pid;

    this.phantom = null;

    setTimeout(function() {

        if(disposed) {
            return;
        }

        if(!disposed) {
            console.log('unable to dispose PhantomJS. Forcing kill...');

            try {
                if(phantomPid) {
                    process.kill(phantomPid, 'SIGKILL');
                }

                callback();
            } catch(e) {
                console.log('error force killing phantomjs pid', e);
                process.kill(_this.options.worker.process.pid, 'SIGKILL');
            }
        }
    }, 10000);


    phridge.disposeAll().then(function() {
        disposed = true;
        callback();
    }).catch(function(err) {
        util.log('error disposing all phantomjs instances:', err);
    });
};

server.exit = function() {
    var _this = this;

    function terminatePhantom() {
        util.log("phantomjs terminated");
        process.exit(0);
    }

    this._disposeAll(terminatePhantom);
};
