var phantom = require('phantom')
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

    var args = ["--load-images=false", "--ignore-ssl-errors=true", "--ssl-protocol=tlsv1"];

    if(this.options.phantomArguments) {
        args = this.options.phantomArguments;
    }

    var port = (this.options.phantomBasePort || 12300) + (this.options.worker.id % 200);

    util.log('starting phantom on port [' + port + ']');

    var opts = {
        port: port,
        binary: process.env.PHANTOMJS_PATH || require('phantomjs').path,
        onExit: function() {
            _this.phantom = null;
            util.log('phantom crashed, restarting...');
            process.nextTick(_.bind(_this.createPhantom, _this));
        }
    };

    if(this.options.onStdout) {
      opts.onStdout = this.options.onStdout;
    }

    if(this.options.onStderr) {
      opts.onStderr = this.options.onStderr;
    }
    
    if(this.options.dnodeOpts) {
      opts.dnodeOpts = this.options.dnodeOpts;
    }

    args.push(opts);

    args.push(_.bind(this.onPhantomCreate, this));

    phantom.create.apply(this, args);
};

server.onPhantomCreate = function(phantom) {
    util.log('started phantom');
    this.phantom = phantom;
    this.phantom.id = Math.random().toString(36);

    if (this.options.worker) {
        this.options.worker.iteration = 0;
    }
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
        this.phantom.createPage(function(page){
            req.prerender.page = page;
            _this.onPhantomPageCreate(req, res);
        });
    }
};

server.onPhantomPageCreate = function(req, res) {
    var _this = this;

    req.prerender.stage = 0;
    req.prerender.pendingRequests = 1;

    this.phantom.set('cookiesEnabled', (req.prerender.cookiesEnabled || _this.options.cookiesEnabled || COOKIES_ENABLED));

    // Listen for updates on resource downloads
    req.prerender.page.onResourceRequested(this.onResourceRequested, _.bind(_this.onResourceRequestedCallback, _this, req, res), _this.options.blockedResources || blockedResources);
    req.prerender.page.set('onResourceReceived', _.bind(_this.onResourceReceived, _this, req, res));
    req.prerender.page.set('onResourceTimeout', _.bind(_this.onResourceTimeout, _this, req, res));

    req.prerender.page.set('viewportSize', { width: 1440, height: 718 });

    req.prerender.page.set('libraryPath', __dirname + '/injections');
    req.prerender.page.set('onInitialized', function(){
      if(!process.env.DISABLE_INJECTION && req.prerender.page) req.prerender.page.injectJs('bind.js');
    });

    req.prerender.page.get('settings.userAgent', function(userAgent) {
        req.prerender.page.set('settings.userAgent', userAgent + ' Prerender (+https://github.com/prerender/prerender)');

        // Fire off a middleware event, then download all of the assets
        _this._pluginEvent("onPhantomPageCreate", [_this.phantom, req, res], function() {
            req.prerender.downloadStarted = req.prerender.lastResourceReceived = new Date();

            req.prerender.downloadChecker = setInterval(function() {
                _this.checkIfPageIsDoneLoading(req, res, req.prerender.status === 'fail');
            }, (req.prerender.pageDoneCheckTimeout || _this.options.pageDoneCheckTimeout || PAGE_DONE_CHECK_TIMEOUT));

            req.prerender.page.open(encodeURI(req.prerender.url), function(status) {
                req.prerender.status = status;
            });
        });
    });
};

/*
 * Note: PhantomJS doesn't call onResourceError for an aborted request
 */
server.onResourceRequested = function (requestData, request, blockedResources) {
    for(var i = 0,l = blockedResources.length; i < l; i++) {
        var regex = new RegExp(blockedResources[i], 'gi');
        if(regex.test(requestData.url)) {
            request.abort();
            requestData.aborted = true;
            break;
        }
    }
};

// Increment the number of pending requests left to download when a new
// resource is requested
server.onResourceRequestedCallback = function (req, res, request) {
    if(!request.aborted) {
        req.prerender.pendingRequests++;
    }
};

// Decrement the number of pending requests left to download after a resource
// is downloaded
server.onResourceReceived = function (req, res, response) {
    req.prerender.lastResourceReceived = new Date();

    //always get the headers off of the first response to pass along
    if(response.id === 1) {
        req.prerender.headers = response.headers;
    }

    //sometimes on redirects, phantomjs doesnt fire the 'end' stage of the original request, so we need to check it here
    if(response.id === 1 && response.status >= 300 && response.status <= 399) {

        var match = _.findWhere(response.headers, { name: 'Location' });
        if (match) {
            req.prerender.redirectURL = util.normalizeUrl(match.value);
        } else {
            req.prerender.redirectURL = response.redirectURL;
        }

        req.prerender.statusCode = response.status;

        if(!(this.options.followRedirect || process.env.FOLLOW_REDIRECT)) {
            //force the response now
            return this.checkIfPageIsDoneLoading(req, res, true);
        }
    }

    if ('end' === response.stage) {
        if(response.url) req.prerender.pendingRequests--;

        if (response.id === 1) {
            req.prerender.pendingRequests--;

            req.prerender.statusCode = response.status;
        }

        if( (this.options.followRedirect || process.env.FOLLOW_REDIRECT) && req.prerender.redirectURL && response.id === 1) {
            req.prerender.statusCode = response.status;
        }
    }
};

// Decrement the number of pending requests to download when there's a timeout
// fetching a resource
server.onResourceTimeout = function(req, res, request) {
    req.prerender.pendingRequests--;
};

// Called occasionally to check if a page is completely loaded
server.checkIfPageIsDoneLoading = function(req, res, force) {
    var timedOut = new Date().getTime() - req.prerender.downloadStarted.getTime() > (req.prerender.resourceDownloadTimeout || this.options.resourceDownloadTimeout || RESOURCE_DOWNLOAD_TIMEOUT)
      , timeSinceLastRequest = new Date().getTime() - req.prerender.lastResourceReceived.getTime();

    // Check against the current stage to make sure we don't finish more than
    // once, and check against a bunch of states that would signal finish - if
    // resource downloads have timed out, if the page has errored out, or if
    // there are no pending requests left
    if(req.prerender.stage < 1 && (force || (req.prerender.status !== null && req.prerender.pendingRequests <= 0 && (timeSinceLastRequest > (req.prerender.waitAfterLastRequest || this.options.waitAfterLastRequest || WAIT_AFTER_LAST_REQUEST))) || timedOut)) {
        req.prerender.stage = 1;
        clearInterval(req.prerender.downloadChecker);
        req.prerender.downloadChecker = null;

        if(req.prerender.status === 'fail') {
            req.prerender.statusCode = 504;
            return res.send(req.prerender.statusCode);
        }

        if(req.prerender.statusCode && req.prerender.statusCode >= 300 && req.prerender.statusCode <= 399) {
            // Finish up if we got a redirect status code
            res.send(req.prerender.statusCode);
        } else {
            // Now evaluate the javascript
            req.prerender.downloadFinished = new Date();
            req.prerender.timeoutChecker = setInterval(_.bind(this.checkIfJavascriptTimedOut, this, req, res), (req.prerender.jsCheckTimeout || this.options.jsCheckTimeout || JS_CHECK_TIMEOUT));
            this.evaluateJavascriptOnPage(req, res);
        }
    }
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

    req.prerender.page.evaluate(this.javascriptToExecuteOnPage, function(obj) {
        // Update the evaluated HTML
        req.prerender.documentHTML = obj.html;
        req.prerender.lastJavascriptExecution = new Date();

        if(!obj.shouldWaitForPrerenderReady || (obj.shouldWaitForPrerenderReady && obj.prerenderReady)) {
            clearInterval(req.prerender.timeoutChecker);
            req.prerender.timeoutChecker = null;

            _this.onPageEvaluate(req, res);
        } else {
            setTimeout(_.bind(_this.evaluateJavascriptOnPage, _this, req, res), (req.prerender.evaluateJavascriptCheckTimeout || this.evaluateJavascriptCheckTimeout || EVALUATE_JAVASCRIPT_CHECK_TIMEOUT));
        }
    });
};

// Fetches the html on the page
server.javascriptToExecuteOnPage = function() {
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

    return  {
        html: '',
        shouldWaitForPrerenderReady: false,
        prerenderReady: window.prerenderReady
    };
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
    if(!req.prerender.page) {
        return;
    }

    req.prerender.page.evaluate(function() {
        try {
            if(localStorage && typeof localStorage.clear == 'function') {
                localStorage.clear();
            }
        } catch (e) {}
    });
};

server._send = function(req, res, statusCode, options) {
    var _this = this;

    if(req.prerender.page) {

        this.clearLocalStorage(req, res);
        req.prerender.page.close();
        req.prerender.page = null;
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
                res.setHeader(header.name, header.value);
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
    //getting 502s for sites that return this header
    res.removeHeader('X-Content-Security-Policy');
    
    res.writeHead(req.prerender.statusCode || 504);

    if (req.prerender.documentHTML) res.write(req.prerender.documentHTML);

    res.end();

    var ms = new Date().getTime() - req.prerender.start.getTime();
    util.log('got', req.prerender.statusCode, 'in', ms + 'ms', 'for', req.prerender.url);

    if((++this.options.worker.iteration >= (this.options.iterations || NUM_ITERATIONS)) || (options && options.abort)) {
        server._killPhantomJS();
    }
};

server._killPhantomJS = function() {
    // this.options.worker.kill('SIGTERM');
    require('tree-kill')(this.phantom.process.pid, 'SIGTERM');
       //  try {
       //     //not happy with this... but when phantomjs is hanging, it can't exit any normal way
       //     util.log('pkilling phantomjs');
       //     require('child_process').spawn('pkill', ['phantomjs']);
       //     this.phantom = null;
       // } catch(e) {
       //     util.log('Error killing phantomjs from javascript infinite loop:', e);
       // }
};
