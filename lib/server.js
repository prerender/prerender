var phantom = require('phantom')
  , _ = require('lodash')
  , util = require('./util.js')
  , os = require('os')
  , zlib = require('zlib');

var config = require('config');
var server = module.exports = {};
var debug = require('debug')('prerender-server');
var logger = require('./logger')('server');
var urlParse = require('url').parse;

var PAGE_DONE_CHECK_TIMEOUT = config.page_done_check_timeout || 50;
var RESOURCE_DOWNLOAD_TIMEOUT = config.resource_download_timeout || 10 * 1000;
var WAIT_AFTER_LAST_REQUEST = config.wait_after_last_request || 500;
var JS_CHECK_TIMEOUT = config.js_check_timeout || 50;
var JS_TIMEOUT = config.js_timeout || 15 * 1000;
var EVALUATE_JAVASCRIPT_CHECK_TIMEOUT = config.evaluate_javascript_check_timeout || 50;

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
  debug('starting phantom: ', args.join(' '));
  logger.info('starting phantom: ', args.join(' '));

  if(this.options.phantomArguments) {
    args = this.options.phantomArguments;
  }

  args.push({
      port: this.options.phantomBasePort || 12300,
      binary: require('phantomjs').path,
      onExit: function() {
          _this.phantom = null;
          logger.warn('phantom exited, restarting...');
          process.nextTick(_.bind(_this.createPhantom, _this));
      }
  });

  args.push(_.bind(this.onPhantomCreate, this));

  phantom.create.apply(this, args);
};

server.onPhantomCreate = function(phantom) {
    this.phantom = phantom;
    this.phantom.id = os.hostname() + '-' + process.pid + '-' + Date.now();
    logger.info('started phantom. id: ', phantom.id);
};

server.onRequest = function(req, res) {
    var _this = this;

    // Status check
    if (req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      var response = {
        phantom: _this.phantom,
        hostname: os.hostname()
      };
      res.write(JSON.stringify(response));
      return res.end();
    }

    // Create a partial out of the _send method for the convenience of plugins
    res.send = _.bind(this._send, this, req, res);

    req.prerender = {
        url: util.getUrl(req),
        start: new Date(),
        valid: true
    };

    var urlObj = urlParse(req.prerender.url);
    logger.inspect(urlObj);
    if (!urlObj.protocol || !urlObj.host) {
      logger.error('invalid request: [%s] from: ', req.prerender.url, req.headers['user-agent']);
      req.prerender.valid = false;
      return res.send(404);
    }

    debug('getting', req.prerender.url);
    logger.info('getting [%s] by [%s]', req.prerender.url, req.headers['user-agent']);

    this._pluginEvent("beforePhantomRequest", [req, res], function() {
        _this.createPage(req, res);
    });
};

server.createPage = function(req, res) {
  var _this = this;
  var waitCount = 0;

  if(!this.phantom) {
    setTimeout(function(){
      waitCount++;
      if (waitCount % 10 === 0) {
        logger.warn('Waiting for this.phantom ... ');
      }

      if (waitCount > 50) {
        _this.createPhantom();
      }

      if (waitCount > 100) {
        logger.error('this.phantom never transpired! Abandoning request: ', req.prerender.url);
        res.send(504, {abort: true});
      }

      _this.createPage(req, res);
    }, 100);
  } 
  else {
    logger.info('Utilizing phantom worker: ', this.phantom.id);
    req.prerender.phantomId = this.phantom.id;
    this.phantom.createPage(function(page){
      logger.debug('Phantom worker created page: ', page);
      req.prerender.page = page;
      _this.onPhantomPageCreate(req, res);
    });
  }
};

server.onPhantomPageCreate = function(req, res) {
    var _this = this;

    req.prerender.stage = 0;
    req.prerender.pendingRequests = 1;

    // Listen for updates on resource downloads
    req.prerender.page.onResourceRequested(this.onResourceRequested, _.bind(_this.onResourceRequestedCallback, _this, req, res));
    req.prerender.page.set('onResourceReceived', _.bind(_this.onResourceReceived, _this, req, res));
    req.prerender.page.set('onResourceError', _.bind(_this.onResourceError, _this, req, res));
    req.prerender.page.set('onResourceTimeout', _.bind(_this.onResourceTimeout, _this, req, res));

    req.prerender.page.set('viewportSize', { width: 1440, height: 718 });

    req.prerender.page.get('settings.userAgent', function(userAgent) {
        req.prerender.page.set('settings.userAgent', userAgent + ' Prerender (+https://github.com/prerender/prerender)');

        // Fire off a middleware event, then download all of the assets
        _this._pluginEvent("onPhantomPageCreate", [_this.phantom, req, res], function() {
            req.prerender.downloadStarted = req.prerender.lastResourceReceived = new Date();

            req.prerender.downloadChecker = setInterval(function() {
                _this.checkIfPageIsDoneLoading(req, res, req.prerender.status === 'fail');
            }, _this.options.pageDoneCheckTimeout || PAGE_DONE_CHECK_TIMEOUT);

            req.prerender.page.open(encodeURI(req.prerender.url.replace(/%20/g, ' ')), function(status) {
                req.prerender.status = status;
            });
        });
    });
};

//We want to abort the request if it's a call to Google Analytics or other tracking services.
server.onResourceRequested = function (requestData, request) {
    if ((/google-analytics.com/gi).test(requestData.url) ||
        (/api.mixpanel.com/gi).test(requestData.url) ||
        (/fonts.googleapis.com/gi).test(requestData.url) ||
        (/stats.g.doubleclick.net/gi).test(requestData.url) ||
        (/mc.yandex.ru/gi).test(requestData.url)){
        request.abort();
    }
};

// Increment the number of pending requests left to download when a new
// resource is requested
server.onResourceRequestedCallback = function (req) {
    req.prerender.pendingRequests++;
};

// Decrement the number of pending requests left to download after a resource
// is downloaded
server.onResourceReceived = function (req, res, response) {
    req.prerender.lastResourceReceived = new Date();

    //sometimes on redirects, phantomjs doesnt fire the 'end' stage of the original request, so we need to check it here
    if(util.normalizeUrl(req.prerender.url) === util.normalizeUrl(response.url) && response.status >= 300 && response.status <= 399) {

        if (response.redirectURL) {
            req.prerender.redirectURL = response.redirectURL;
        } else {
            var match = _.findWhere(response.headers, { name: 'Location' });
            if (match) {
                req.prerender.redirectURL = util.normalizeUrl(match.value);
            }
        }

        req.prerender.statusCode = response.status;

        if(!(this.options.followRedirect || config.follow_redirect)) {
            //force the response now
            return this.checkIfPageIsDoneLoading(req, res, true);
        }
    }

    if ('end' === response.stage) {
        req.prerender.pendingRequests--;

        if (util.normalizeUrl(req.prerender.url) === util.normalizeUrl(response.url)) {
            req.prerender.pendingRequests--;

            req.prerender.statusCode = response.status;
        }

        if( (this.options.followRedirect || config.follow_redirect) && req.prerender.redirectURL && util.normalizeUrl(req.prerender.redirectURL) === util.normalizeUrl(response.url)) {
            req.prerender.statusCode = response.status;
        }
    }
};

// Decrement the number of pending requests to download when there's an error
// fetching a resource
server.onResourceError = function(req) {
    req.prerender.pendingRequests--;
};

// Decrement the number of pending requests to download when there's a timeout
// fetching a resource
server.onResourceTimeout = function(req) {
    req.prerender.pendingRequests--;
};

// Called occasionally to check if a page is completely loaded
server.checkIfPageIsDoneLoading = function(req, res, force) {
    var timedOut = new Date().getTime() - req.prerender.downloadStarted.getTime() > (this.options.resourceDownloadTimeout || RESOURCE_DOWNLOAD_TIMEOUT)
      , timeSinceLastRequest = new Date().getTime() - req.prerender.lastResourceReceived.getTime();

    // Check against the current stage to make sure we don't finish more than
    // once, and check against a bunch of states that would signal finish - if
    // resource downloads have timed out, if the page has errored out, or if
    // there are no pending requests left
    if(req.prerender.stage < 1 && (force || (req.prerender.pendingRequests <= 0 && timeSinceLastRequest > (this.options.waitAfterLastRequest || WAIT_AFTER_LAST_REQUEST)) || timedOut)) {
        req.prerender.stage = 1;
        clearInterval(req.prerender.downloadChecker);
        req.prerender.downloadChecker = null;

        if(req.prerender.statusCode && req.prerender.statusCode >= 300 && req.prerender.statusCode <= 399) {
            // Finish up if we got a redirect status code
            res.send(req.prerender.statusCode);
        } else {
            // Now evaluate the javascript
            req.prerender.timeoutChecker = setInterval(_.bind(this.checkIfJavascriptTimedOut, this, req, res), (this.options.jsCheckTimeout || JS_CHECK_TIMEOUT));
            this.evaluateJavascriptOnPage(req, res);
        }
    }
};

// Checks to see if the execution of javascript has timed out
server.checkIfJavascriptTimedOut = function(req, res) {
  var timeout = new Date().getTime() - req.prerender.downloadStarted.getTime() > (this.options.jsTimeout || JS_TIMEOUT);

  if (timeout && req.prerender.lastJavascriptExecution && new Date().getTime() - req.prerender.lastJavascriptExecution.getTime() < 2000) {
    debug('Timed out. Sending request with HTML on the page');
    logger.warn('Timed out. Sending request with HTML on the page');
    clearInterval(req.prerender.timeoutChecker);
    req.prerender.timeoutChecker = null;

    this.onPageEvaluate(req, res);
  } else if (timeout && req.prerender.stage < 2) {
    logger.error('Experiencing infinite javascript loop. Killing phantomjs... %j', req.prerender);
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
            setTimeout(_.bind(_this.evaluateJavascriptOnPage, _this, req, res), (this.evaluateJavascriptCheckTimout || EVALUATE_JAVASCRIPT_CHECK_TIMEOUT));
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

server._send = function(req, res, statusCode, options) {
    var _this = this;

    if(req.prerender.page) {
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
        if (req.prerender.redirectURL) {
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
            _this._sendResponse.apply(_this, [req, res, options]);
        }
    });
};

server._sendResponse = function(req, res, options) {
  var _this = this;
  var length = Buffer.isBuffer(req.prerender.documentHTML) ? 
    req.prerender.documentHTML.length : Buffer.byteLength(req.prerender.documentHTML, 'utf8');

  if (req.prerender.documentHTML) {
    res.setHeader('Content-Length', length);
  }

  res.writeHead(req.prerender.statusCode || 504);

  if (req.prerender.documentHTML) res.write(req.prerender.documentHTML);

  res.end();

  var ms = new Date().getTime() - req.prerender.start.getTime();
  debug('Done:', req.prerender.statusCode, 'in', ms + 'ms', 'for', req.prerender.url, length, 'bytes');
  logger.info('Done: [HTTP %d] [%d ms] [%s] [%d bytes]', req.prerender.statusCode, ms, req.prerender.url, length);

  // try {
  //   logger.info('Killing all phantomjs ...');
  //   require('child_process').spawn('pkill', ['phantomjs']);
  //   _this.phantom = null;
  //   logger.debug('Killed phantomjs');
  // } catch(e) {
  //   logger.debug('Error killing phantomjs:', e);
  // }
};
