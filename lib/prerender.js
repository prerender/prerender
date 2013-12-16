var phantom = require('phantom')
  , http = require('http')
  , url = require('url')
  , _ = require('lodash');

var prerender = exports = module.exports = {};

prerender.createServer = function() {
    this.plugins = this.plugins || [];

    this.createWebServer();
};

prerender.use = function(plugin) {
    this.plugins = this.plugins || [];

    this.plugins.push(plugin);
    if (typeof plugin.init === 'function') plugin.init();
};

prerender.createPhantom = function() {
    var _this = this;
    console.log('starting phantom')

    phantom.create('--load-images=false', '--ignore-ssl-errors=true', {
        binary: require('phantomjs').path,
        port: process.env.PHANTOMJS_PORT || 12300,
        onExit: function() {
            _this.phantom = null;
            console.log('phantom crashed, restarting...')
            process.nextTick(_.bind(_this.createPhantom, _this));
        }
    }, _.bind(this.onPhantomCreate, this));
};

prerender.onPhantomCreate = function(phantom) {
    console.log('started phantom')
    this.phantom = phantom;
    this.phantom.id = Math.random().toString(36);
};

prerender.createWebServer = function() {
    var _this = this;

    http.createServer(_.bind(this.onRequest, this)).listen(process.env.PORT || 3000);
    console.log('Server running on port ' + (process.env.PORT || 3000));

    this.createPhantom();
};

prerender.onRequest = function(req, res) {
    var _this = this;

    res.send = _.bind(this.send, this, req, res);

    req.prerender = {
        url: this.getUrl(req),
        start: new Date()
    };

    console.log('getting', req.prerender.url);

    this.pluginsBeforePhantomRequest(req, res, function() {
        _this.createPage(req, res);
    });
};

prerender.createPage = function(req, res) {
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

prerender.getUrl = function(req) {
    var decodedUrl
      , parts;

    try {
        decodedUrl = decodeURIComponent(req.url);
    } catch (e) {
        decodedUrl = req.url;
    }

    parts = url.parse(decodedUrl, true);

    if (parts.query.hasOwnProperty('_escaped_fragment_')) {

        if(parts.query['_escaped_fragment_']) parts.hash = '#!' + parts.query['_escaped_fragment_'];
        delete parts.query['_escaped_fragment_'];
        delete parts.search;
    }

    var newUrl = url.format(parts);

    if(newUrl[0] == '/') newUrl = newUrl.substr(1);
    
    return newUrl;
};

prerender.pluginsBeforePhantomRequest = function(req, res, callback) {
    var _this = this
      , index = 0
      , next;

    next = function() {
        var layer = _this.plugins[index++];
        if (!layer) return callback();

        if (layer.beforePhantomRequest) {
            layer.beforePhantomRequest(req, res, next);
        } else {
            next();
        }
    }
    next();
};

prerender.pluginsAfterPhantomRequest = function(req, res, callback) {
    var _this = this
      , index = 0
      , next;

    next = function() {
        var layer = _this.plugins[index++];
        if (!layer) return callback();

        if (layer.afterPhantomRequest) {
            layer.afterPhantomRequest(req, res, next);
        } else {
            next();
        }
    }
    next();
};

prerender.pluginsOnPhantomPageCreate = function(req, res, callback) {
    var _this = this
      , index = 0
      , next;

    next = function() {
        var layer = _this.plugins[index++];
        if (!layer) return callback();

        if (layer.onPhantomPageCreate) {
            layer.onPhantomPageCreate(req, res, next);
        } else {
            next();
        }
    }
    next();
};

prerender.pluginsBeforeSend = function(req, res, callback) {
    var _this = this
      , index = 0
      , next;

    next = function() {
        var layer = _this.plugins[index++];
        if (!layer) return callback();

        if (layer.beforeSend) {
            layer.beforeSend(req, res, next);
        } else {
            next();
        }
    }
    next();
};

prerender.onResourceRequested = function (req, res, requestData) {
    req.prerender.pendingRequests++;
};

prerender.onResourceReceived = function (req, res, response) {

    // http://prerender.io/ should equal http://prerender.io
    if (req.prerender.url[req.prerender.url.length-1] === '/' && response.url[response.url.length-1] !== '/') {
        response.url = response.url + '/';
    }

    // http://prerender.io should equal http://prerender.io/
    if (req.prerender.url[req.prerender.url.length-1] !== '/' && response.url[response.url.length-1] === '/') {
        response.url = response.url.substring(0, response.url.length-1);
    }

    //sometimes on redirects, phantomjs doesnt fire the 'end' stage of the original request, so we need to check it here
    if(req.prerender.url == response.url && response.status >= 300 && response.status <= 399) {
        if (response.redirectURL) req.prerender.redirectURL = response.redirectURL;

        if (response.status >= 300 && response.status <= 399) {
            return res.send(response.status);
        }
    }

    if ('end' === response.stage) { 
        req.prerender.pendingRequests--;

        if (req.prerender.url === response.url) {
            req.prerender.pendingRequests--;  

            req.prerender.statusCode = response.status;
        }
    } 
};

prerender.onResourceError = function(req, res, resourceError) {
    req.prerender.pendingRequests--;
};

prerender.onResourceTimeout = function(req, res, request) {
    req.prerender.pendingRequests--;
};

prerender.onPhantomPageCreate = function(req, res) {
    var _this = this;

    req.prerender.pendingRequests = 1;

    req.prerender.page.set('onResourceRequested', _.bind(this.onResourceRequested, this, req, res));
    req.prerender.page.set('onResourceReceived', _.bind(this.onResourceReceived, this, req, res));
    req.prerender.page.set('onResourceError', _.bind(this.onResourceError, this, req, res));
    req.prerender.page.set('onResourceTimeout', _.bind(this.onResourceTimeout, this, req, res));
    req.prerender.page.setHeaders({'User-Agent': 'Prerender (+https://github.com/collectiveip/prerender)'});

    this.pluginsOnPhantomPageCreate(req, res, function(){

        req.prerender.intervalStart = new Date();
        req.prerender.interval = setInterval(function(){

            if (req.prerender.status === 'fail') {
                return res.send(404);
            }

            _this.checkIfPageIsDoneLoading(req, res);
        }, 2000);

        req.prerender.page.open(req.prerender.url, function(status){
            req.prerender.status = status;
        });
    });
};

prerender.send = function(req, res, statusCode, documentHTML) {

    //due to the asynchronous nature of all of the different timeouts, checks, and requests, we're going to do this for safety.
    if(res.sent) return console.log('Tried to send request twice, ignoring second res.send()');
    res.sent = true;
    
    req.prerender.statusCode = statusCode;
    req.prerender.documentHTML = documentHTML;

    if(req.prerender.interval) {
        clearInterval(req.prerender.interval);
        req.prerender.interval = null;
    }

    this.pluginsBeforeSend(req, res, function() {

        if (req.prerender.redirectURL) {
            res.setHeader('Location', req.prerender.redirectURL);
        }

        if (req.prerender.documentHTML) {
            if(Buffer.isBuffer(req.prerender.documentHTML)) {
                res.setHeader('Content-Length', req.prerender.documentHTML.length);
            } else {
                res.setHeader('Content-Length', Buffer.byteLength(req.prerender.documentHTML, 'utf8'));
            }
        }

        res.writeHead(statusCode, {
            'Content-Type': 'text/html;charset=UTF-8',
            'Cache-Control': 86400
        });
        
        if (req.prerender.documentHTML) res.write(req.prerender.documentHTML);

        res.end();
        if (req.prerender.page) req.prerender.page.close();
        console.log('got', statusCode, 'in', new Date().getTime() - req.prerender.start.getTime() + 'ms', 'for', req.prerender.url)
    });
};

prerender.checkIfPageIsDoneLoading = function(req, res) {
    var _this = this
      , noPendingRequests = req.prerender.pendingRequests <= 0
      , timeout = new Date().getTime() - req.prerender.intervalStart.getTime() > 20000;

    if (noPendingRequests || timeout) {

        clearInterval(req.prerender.interval);
        req.prerender.intervalStart = new Date();
        req.prerender.interval = setInterval(function() {
            _this.checkIfJavascriptTimedOut(req, res);
        }, 50);

        _this.evaluateJavascriptOnPage(req, res);
    }
};

prerender.evaluateJavascriptOnPage = function(req, res) {
    var _this = this;

    req.prerender.page.evaluate(this.javascriptToExecuteOnPage, function(obj){
        req.prerender.documentHTML = obj.html;
        req.prerender.lastJavascriptExecution = new Date;

        if(!obj.shouldWaitForPrerenderReady || (obj.shouldWaitForPrerenderReady && obj.prerenderReady)) {
            clearInterval(req.prerender.interval);
            req.prerender.interval = null;

            _this.onPageEvaluate(req, res);
        } else {
            setTimeout(function() {
                _this.evaluateJavascriptOnPage(req, res);
            }, 50);
        }
    });
};

prerender.checkIfJavascriptTimedOut = function(req, res) {
    // if phantom crashed and restarted in the middle of this request,
    // we won't get a response but we don't want to get in a loop of restarting the server
    if(!this.phantom || this.phantom.id != req.prerender.phantomId) {
        console.log('phantomjs crashed in the middle of the request, retrying', req.prerender.url);
        clearInterval(req.prerender.interval);
        req.prerender.interval = null;
        return this.createPage(req, res);
    }

    var timeout = new Date().getTime() - req.prerender.intervalStart.getTime() > 10000;

    if (timeout && req.prerender.lastJavascriptExecution && (new Date).getTime() - req.prerender.lastJavascriptExecution.getTime() < 2000) {
        console.log('Timed out. Sending request with HTML on the page');
        clearInterval(req.prerender.interval);
        req.prerender.interval = null;

        this.onPageEvaluate(req, res);
    } else if (timeout) {
        res.send(503);
        try {
            //not happy with this... but when phantomjs is hanging, it can't exit any normal way
            console.log('Experiencing infinite javascript loop. Killing phantomjs...');
            require('child_process').spawn('pkill', ['phantomjs']);
        } catch(e) {
            console.log('Error killing phantomjs from javascript infinite loop:', e);
        }
    }
};

prerender.javascriptToExecuteOnPage = function() {
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
        return {
            html: '',
            shouldWaitForPrerenderReady: false,
            prerenderReady: window.prerenderReady
        };
    } catch (e) {
        return  {
            html: '',
            shouldWaitForPrerenderReady: false,
            prerenderReady: window.prerenderReady
        };
    }
};

prerender.onPageEvaluate = function(req, res) {
    var _this = this;

    if (!req.prerender.documentHTML) {
        return res.send(req.prerender.statusCode || 404);
    }

    this.pluginsAfterPhantomRequest(req, res, function() {

        res.send(req.prerender.statusCode || 200, req.prerender.documentHTML);
    });
};
