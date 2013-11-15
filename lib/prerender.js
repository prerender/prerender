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

    res.send = _.bind(this.send, this, req, res);

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
            _this.createPage(req, res);
        }, 50);
    } else {
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

    if ('end' === response.stage) { 
        req.prerender.pendingRequests--;

        if (req.prerender.url === response.url) {
            
            if (response.redirectURL) req.prerender.redirectURL = response.redirectURL;

            req.prerender.statusCode = response.status;

            if (response.status >= 300 && response.status <= 399) {
                clearInterval(req.prerender.interval);
                req.prerender.interval = null;

                res.send(response.status);
            }
        }
    } 
};

prerender.onResourceError = function(req, res, resourceError) {
    req.prerender.pendingRequests--;
};

prerender.onPhantomPageCreate = function(req, res) {
    var _this = this;

    req.prerender.pendingRequests = 0;

    req.prerender.page.set('onResourceRequested', _.bind(this.onResourceRequested, this, req, res));
    req.prerender.page.set('onResourceReceived', _.bind(this.onResourceReceived, this, req, res));
    req.prerender.page.set('onResourceError', _.bind(this.onResourceError, this, req, res));
    req.prerender.page.setHeaders({'User-Agent': 'Prerender (+https://github.com/collectiveip/prerender)'});

    this.pluginsOnPhantomPageCreate(req, res, function(){

        req.prerender.intervalStart = new Date();
        req.prerender.interval = setInterval(function(){

            if (req.prerender.status === 'fail') {
                clearInterval(req.prerender.interval);
                req.prerender.interval = null;

                return res.send(404);
            }

            _this.checkIfPageIsDoneLoading(req, res);
        }, 50);

        req.prerender.page.open(req.prerender.url, function(status){
            req.prerender.status = status;
        });
    });
};

prerender.send = function(req, res, statusCode, documentHTML) {

    req.prerender.statusCode = statusCode;
    req.prerender.documentHTML = documentHTML;

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

        req.prerender.page.evaluate(this.javascriptToExecuteOnPage, function(obj){
            req.prerender.documentHTML = obj.html;

            if(req.prerender.interval &&
                (timeout || !obj.shouldWaitForPrerenderReady || (obj.shouldWaitForPrerenderReady && obj.prerenderReady))) {
                clearInterval(req.prerender.interval);
                req.prerender.interval = null;

                _this.onPageEvaluate(req, res);
            }
        });
    }
};

prerender.checkIfJavascriptTimedOut = function(req, res) {
    var timeout = new Date().getTime() - req.prerender.intervalStart.getTime() > 10000;

    if (timeout) {
        clearInterval(req.prerender.interval);
        req.prerender.interval = null;
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
        return res.send(req.prerender.statusCode || 404);
    }

    this.pluginsAfterPhantomRequest(req, res, function() {

        res.send(req.prerender.statusCode || 200, req.prerender.documentHTML);
    });
};
