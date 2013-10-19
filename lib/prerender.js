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

    phantom.create('--load-images=false', {
        binary: require('phantomjs').path,
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
};

prerender.createWebServer = function() {
    var _this = this;

    http.createServer(_.bind(this.onRequest, this)).listen(process.env.PORT || 3000);
    console.log('Server running on port ' + (process.env.PORT || 3000));

    this.createPhantom();
};

prerender.onRequest = function(req, res) {
    var _this = this;

    res.send = _.bind(this.send, res, req);

    req.prerender = {
        url: this.getUrl(req).substr(1),
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
            _this.createPage(res, res);
        }, 50);
    } else {
        this.phantom.createPage(function(page){
            req.prerender.page = page;
            _this.onPhantomPageCreate(req, res);
        });
    }
};

prerender.getUrl = function(req) {
    var parts = url.parse(decodeURIComponent(req.url), true);

    if (!parts.query.hasOwnProperty('_escaped_fragment_')) return req.url;

    if(parts.query['_escaped_fragment_']) parts.hash = '#!' + parts.query['_escaped_fragment_'];
    delete parts.query['_escaped_fragment_'];
    delete parts.search;

    return url.format(parts);
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

prerender.onPhantomPageCreate = function(req, res) {
    var _this = this;

    req.prerender.pendingRequests = 0;

    req.prerender.page.set('onResourceRequested', function (requestData) { req.prerender.pendingRequests++; });
    req.prerender.page.set('onResourceReceived', function (response) { if ('end' === response.stage) { req.prerender.pendingRequests--; } });
    req.prerender.page.set('onResourceError', function(resourceError) { req.prerender.pendingRequests--; });

    this.pluginsOnPhantomPageCreate(req, res, function(){

        req.prerender.page.open(req.prerender.url, function(status){
            req.prerender.status = status;
            _this.onPageOpen(req, res);
        });
    });
};

prerender.onPageOpen = function(req, res) {
    var _this = this;

    if (req.prerender.status === 'fail') {
        return res.send(404);
    }

    req.prerender.intervalStart = new Date();
    req.prerender.interval = setInterval(function(){
        _this.checkIfPageIsDoneLoading(req, res);
    }, 50);
};

prerender.send = function(req, statusCode, documentHTML) {

    if (documentHTML) {
        if(Buffer.isBuffer(documentHTML)) {
            this.setHeader('Content-Length', documentHTML.length);
        } else {
            this.setHeader('Content-Length', Buffer.byteLength(documentHTML, 'utf8'));
        }
    }

    this.writeHead(statusCode, {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 86400
    });
    
    if (documentHTML) this.write(documentHTML);

    this.end();
    if (req.prerender.page) req.prerender.page.close();
    console.log('got', statusCode, 'in', new Date().getTime() - req.prerender.start.getTime() + 'ms', 'for', req.prerender.url)
};

prerender.checkIfPageIsDoneLoading = function(req, res) {
    var _this = this
      , noPendingRequests = req.prerender.pendingRequests <= 0
      , timeout = new Date().getTime() - req.prerender.intervalStart.getTime() > 20000;

    if (noPendingRequests || timeout) {
        req.prerender.page.evaluate(this.javascriptToExecuteOnPage, function(obj){
            req.prerender.documentHTML = obj.html;

            if(timeout || !obj.shouldWaitForPrerenderReady || (obj.shouldWaitForPrerenderReady && obj.prerenderReady)) {
                clearInterval(req.prerender.interval);
                _this.onPageEvaluate(req, res);
            }
        });
    }
};

prerender.javascriptToExecuteOnPage = function() {
    try {
        var html = document && document.getElementsByTagName('html');
        if (html && html[0]) {
            return {
                html: html[0].outerHTML,
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
        return res.send(404);
    }

    this.pluginsAfterPhantomRequest(req, res, function() {

        res.send(200, req.prerender.documentHTML);
    });
};
