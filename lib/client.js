var http = require('http')
  , url = require('url')
  , _ = require('lodash')
  , util = require("util")
  , PrerenderEngine = require("./engine");

var CHECKER_TIMEOUT = 50;
var RESOURCE_DOWNLOAD_TIMEOUT = process.env.PRERENDER_RESOURCE_DOWNLOAD_TIMEOUT || 10 * 1000;
var JS_TIMEOUT = process.env.PRERENDER_JS_TIMEOUT || 10 * 1000;

function normalizeUrl(u) {
    return url.format(url.parse(u, true));
}

function PrerenderClient(phantom) {
    PrerenderEngine.call(this, phantom);
    phantom.on("queueItemReady", _.bind(this.onQueueItemReady, this));
}

util.inherits(PrerenderClient, PrerenderEngine);

PrerenderClient.prototype.start = function() {
    this.phantom.start();
    console.log("Starting client");
};

PrerenderClient.prototype.onQueueItemReady = function(item) {
    var _this = this;

    var context = {
        // Number of pending requests left. Starts at 1 and the root resource
        // is double-counted to make sure a response isn't sent too early
        pendingRequests: 1,

        // The current stage we're in:
        // 0 - downloading resources
        // 1 - evaluating javascript
        // 2 - done
        stage: 0,

        // The current request being processed
        request: item,

        // Interval to check if downloads are complete
        downloadChecker: null,

        // When the download interval was started
        downloadStarted: null,

        // Timeout to check if the javascript evaluation has timed out
        timeoutChecker: null,

        // The response payload that will be sent back to the server
        response: {
            redirectURL: null,
            statusCode: null,
            documentHTML: null
        }
    };

    this.phantom.ph.createPage(function(page) {
        page.set('onResourceRequested', _.bind(_this.onResourceRequested, _this, page, context));
        page.set('onResourceReceived', _.bind(_this.onResourceReceived, _this, page, context));
        page.set('onResourceError', _.bind(_this.onResourceError, _this, page, context));
        page.setHeaders({'User-Agent': 'Prerender (+https://github.com/collectiveip/prerender)'});

        _this._pluginEvent("onPhantomPageCreate", [page, context], function() {
            context.downloadStarted = new Date();

            context.downloadChecker = setInterval(function() {
                _this.checkIfPageIsDoneLoading(page, context, context.response.status == "fail");
            }, CHECKER_TIMEOUT);

            page.open(context.request.url, function(status) {
                context.response.status = status;
            });
        });
    });
};

PrerenderClient.prototype.onResourceRequested = function (page, context, requestData) {
    context.pendingRequests++;
};

PrerenderClient.prototype.onResourceReceived = function (page, context, response) {
    if ('end' === response.stage) { 
        context.pendingRequests--;

        if (normalizeUrl(context.request.url) === normalizeUrl(response.url)) {
            context.pendingRequests--;
            if (response.redirectURL) context.response.redirectURL = response.redirectURL;
            context.response.statusCode = response.status;
        }
    }
};

PrerenderClient.prototype.onResourceError = function(page, context, resourceError) {
    context.pendingRequests--;
};

PrerenderClient.prototype.checkIfPageIsDoneLoading = function(page, context, force) {
    if(context.pendingRequests < 0) {
        throw new Error("There should not be negative pending requests");
    }

    var timedOut = new Date().getTime() - context.downloadStarted.getTime() > RESOURCE_DOWNLOAD_TIMEOUT;

    if(context.stage < 1 && (force || context.pendingRequests == 0 || timedOut)) {
        context.stage = 1;
        clearInterval(context.downloadTimeout);
        context.downloadTimeout = null;

        if(context.response.statusCode && context.response.statusCode >= 300 && context.response.statusCode <= 399) {
            this.response(context, false);
        } else {
            context.timeoutChecker = setTimeout(_.bind(this.checkIfJavascriptTimedOut, this, page, context), JS_TIMEOUT);
            this.evaluateJavascriptOnPage(page, context);
        }
    }
};

PrerenderClient.prototype.checkIfJavascriptTimedOut = function(page, context) {
    if(context.stage < 2) {
        this.respond(context, true);
    }
};

PrerenderClient.prototype.evaluateJavascriptOnPage = function(page, context) {
    var _this = this;

    page.evaluate(this.javascriptToExecuteOnPage, function(obj) {
        context.response.documentHTML = obj.html;

        if(!obj.shouldWaitForPrerenderReady || obj.prerenderReady) {
            _this.onPageEvaluate(page, context);
        } else {
            setTimeout(_.bind(this.evaluateJavascriptOnPage, this, page, context), CHECKER_TIMEOUT);
        }
    });
};

PrerenderClient.prototype.javascriptToExecuteOnPage = function() {
    try {
        var html = document && document.getElementsByTagName('html');

        if (html && html[0]) {
            return {
                html: html[0].outerHTML,
                shouldWaitForPrerenderReady: typeof window.prerenderReady === 'boolean',
                prerenderReady: window.prerenderReady
            };
        }
    } catch(e) { }

    return  {
        html: '',
        shouldWaitForPrerenderReady: false,
        prerenderReady: window.prerenderReady
    };
};

PrerenderClient.prototype.onPageEvaluate = function(page, context) {
    var _this = this;

    if(context.stage < 2) {
        context.stage = 2;

        if (!context.response.documentHTML) {
            this.respond(context, false);
        } else {
            this._pluginEvent("afterPhantomRequest", [page, context], function() {
                _this.respond(context, false);
            });
        }
    }
};

PrerenderClient.prototype.respond = function(context, abort) {
    context.stage = 2;
    context.response.statusCode = context.response.statusCode || 404;
    this.phantom.queueItemResponse(context.response);

    if(abort) {
        this.phantom.stop();
    }
};

module.exports = PrerenderClient;
