var http = require('http')
  , url = require('url')
  , _ = require('lodash')
  , util = require("util")
  , PrerenderEngine = require("./engine");


// Time in milliseconds to check for updates on the page
var CHECKER_TIMEOUT = 50;

// Maximum time in milliseconds to wait for the completion of resource
// downloads
var RESOURCE_DOWNLOAD_TIMEOUT = process.env.PRERENDER_RESOURCE_DOWNLOAD_TIMEOUT || 10 * 1000;

// Maximum time in milliseconds to wait for the completion of javascript
// execution
var JS_TIMEOUT = process.env.PRERENDER_JS_TIMEOUT || 10 * 1000;

// Time in milliseconds to check for javascript timeout
var JS_TIMEOUT_CHECKER = 50;

// Time in milliseconds to evaluate javascript on the web page
var EVALUATE_JAVASCRIPT_CHECKER = 50;

// Time in milliseconds to wait after the last request comes in to begin checking the page
var WAIT_AFTER_LAST_REQUEST = 500;

// Normalizes unimportant differences in URLs - e.g. ensures
// http://google.com/ and http://google.com normalize to the same string
function normalizeUrl(u) {
    return url.format(url.parse(u, true));
}

function PrerenderClient(phantom) {
    PrerenderEngine.call(this, phantom);
    phantom.on("queueItemReady", _.bind(this.onQueueItemReady, this));
}

util.inherits(PrerenderClient, PrerenderEngine);

// Starts a new prerender client
PrerenderClient.prototype.start = function() {
    this.phantom.start();
    console.log("Starting client");
};

// Fired when a new request comes in
PrerenderClient.prototype.onQueueItemReady = function(item) {
    var _this = this;

    // Create a context that we can share between functions
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

        // When the last resource finished downloading
        lastResourceReceived: null,

        // The response payload that will be sent back to the server
        response: {
            redirectURL: null,
            statusCode: null,
            documentHTML: null
        }
    };

    this.phantom.ph.createPage(function(page) {
        // Listen for updates on resource downloads
        page.set('onResourceRequested', _.bind(_this.onResourceRequested, _this, page, context));
        page.set('onResourceReceived', _.bind(_this.onResourceReceived, _this, page, context));
        page.set('onResourceError', _.bind(_this.onResourceError, _this, page, context));
        page.set('onResourceTimeout', _.bind(_this.onResourceTimeout, _this, page, context));

        page.setHeaders({'User-Agent': 'Prerender (+https://github.com/collectiveip/prerender)'});

        // Fire off a middleware event, then download all of the assets
        _this._pluginEvent("onPhantomPageCreate", [page, context], function() {
            context.downloadStarted = context.lastResourceReceived = new Date();

            context.downloadChecker = setInterval(function() {
                _this.checkIfPageIsDoneLoading(page, context, context.response.status === 'fail');
            }, CHECKER_TIMEOUT);

            page.open(context.request.url, function(status) {
                context.response.status = status;
            });
        });
    });
};

// Increment the number of pending requests left to download when a new
// resource is requested
PrerenderClient.prototype.onResourceRequested = function (page, context, requestData) {
    context.pendingRequests++;
};

// Decrement the number of pending requests left to download after a resource
// is downloaded
PrerenderClient.prototype.onResourceReceived = function (page, context, response) {
    context.lastResourceReceived = new Date;

    //sometimes on redirects, phantomjs doesnt fire the 'end' stage of the original request, so we need to check it here
    if(normalizeUrl(context.request.url) === normalizeUrl(response.url) && response.status >= 300 && response.status <= 399) {
        if (response.redirectURL) context.response.redirectURL = response.redirectURL;

        context.response.statusCode = response.status;
        //force the response now
        return this.checkIfPageIsDoneLoading(page, context, true);
    }

    if ('end' === response.stage) { 
        context.pendingRequests--;

        if (normalizeUrl(context.request.url) === normalizeUrl(response.url)) {
            context.pendingRequests--;
            
            context.response.statusCode = response.status;
        }
    }
};

// Decrement the number of pending requests to download when there's an error
// fetching a resource
PrerenderClient.prototype.onResourceError = function(page, context, resourceError) {
    context.pendingRequests--;
};

// Decrement the number of pending requests to download when there's a timeout
// fetching a resource
PrerenderClient.prototype.onResourceTimeout = function(page, context, request) {
    context.pendingRequests--;
};

// Called occasionally to check if a page is completely loaded
PrerenderClient.prototype.checkIfPageIsDoneLoading = function(page, context, force) {
    var timedOut = new Date().getTime() - context.downloadStarted.getTime() > RESOURCE_DOWNLOAD_TIMEOUT
      , timeSinceLastRequest = new Date().getTime() - context.lastResourceReceived.getTime();

    // Check against the current stage to make sure we don't finish more than
    // once, and check against a bunch of states that would signal finish - if
    // resource downloads have timed out, if the page has errored out, or if
    // there are no pending requests left
    if(context.stage < 1 && (force || (context.pendingRequests <= 0 && timeSinceLastRequest > WAIT_AFTER_LAST_REQUEST) || timedOut)) {
        context.stage = 1;
        clearInterval(context.downloadTimeout);
        context.downloadTimeout = null;

        if(context.response.statusCode && context.response.statusCode >= 300 && context.response.statusCode <= 399) {
            // Finish up if we got a redirect status code
            this.respond(page, context, false);
        } else {
            // Now evaluate the javascript
            context.timeoutChecker = setInterval(_.bind(this.checkIfJavascriptTimedOut, this, page, context), JS_TIMEOUT_CHECKER);
            this.evaluateJavascriptOnPage(page, context);
        }
    }
};

// Checks to see if the execution of javascript has timed out
PrerenderClient.prototype.checkIfJavascriptTimedOut = function(page, context) {

    var timeout = new Date().getTime() - context.downloadStarted.getTime() > JS_TIMEOUT;

    if (timeout && context.lastJavascriptExecution && new Date().getTime() - context.lastJavascriptExecution.getTime() < 2000) {
        console.log('Timed out. Sending request with HTML on the page');
        clearInterval(context.timeoutChecker);
        context.timeoutChecker = null;

        this.onPageEvaluate(page, context);
    } else if (timeout && context.stage < 2) {
        console.log('Experiencing infinite javascript loop. Killing phantomjs...');
        this.respond(page, context, true);
    }
};

// Evaluates the javascript on the page
PrerenderClient.prototype.evaluateJavascriptOnPage = function(page, context) {
    var _this = this;

    if(context.stage >= 2) return;

    page.evaluate(this.javascriptToExecuteOnPage, function(obj) {
        // Update the evaluated HTML
        context.response.documentHTML = obj.html;
        context.lastJavascriptExecution = new Date;

        if(!obj.shouldWaitForPrerenderReady || (obj.shouldWaitForPrerenderReady && obj.prerenderReady)) {
            clearInterval(context.timeoutChecker);
            context.timeoutChecker = null;

            _this.onPageEvaluate(page, context);
        } else {
            setTimeout(_.bind(_this.evaluateJavascriptOnPage, _this, page, context), EVALUATE_JAVASCRIPT_CHECKER);
        }
    });
};

// Fetches the html on the page
PrerenderClient.prototype.javascriptToExecuteOnPage = function() {
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
PrerenderClient.prototype.onPageEvaluate = function(page, context) {
    var _this = this;

    if(context.stage >= 2) return;

    context.stage = 2;

    if (!context.response.documentHTML) {
        this.respond(page, context, false);
    } else {
        this._pluginEvent("afterPhantomRequest", [page, context], function() {
            _this.respond(page, context, false);
        });
    }
};

// Sends a response back to the server
PrerenderClient.prototype.respond = function(page, context, abort) {
    page.close();
    context.stage = 2;

    //send a 503 if we didn't get a status code
    context.response.statusCode = context.response.statusCode || 504;
    this.phantom.queueItemResponse(context.response);

    // Exit the process if we're in an erroneous state
    if(abort) {
        this.phantom.stop();
    }
};

module.exports = PrerenderClient;
