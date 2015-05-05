/*jshint sub: true */
var url = require('url');

var util = exports = module.exports = {};

// Normalizes unimportant differences in URLs - e.g. ensures
// http://google.com/ and http://google.com normalize to the same string
util.normalizeUrl = function (u) {
    return url.format(url.parse(u, true));
};

// Gets the URL to prerender from a request, stripping out unnecessary parts
util.getUrl = function (req) {
    var parts;

    parts = util.getUrlParts(req);

    // Remove the _escaped_fragment_ query parameter
    if (parts.query && parts.query.hasOwnProperty('_escaped_fragment_')) {
        if (parts.query['_escaped_fragment_']) parts.hash = '#!' + parts.query['_escaped_fragment_'];
        delete parts.query['_escaped_fragment_'];
        delete parts.search;
    }

    // Remove the cache bust parameter, since it has no use to upstream
    if (parts.query && parts.query.hasOwnProperty('_bust_cache')) delete parts.query['_bust_cache'];

    var newUrl = url.format(parts);
    if (newUrl[0] === '/') newUrl = newUrl.substr(1);
    return newUrl;
};

util.shouldBustCache = function (req) {
    var parts;

    parts = util.getUrlParts(req);

    return (parts.query && parts.query.hasOwnProperty('_bust_cache'));
};

util.getUrlParts = function (req) {
    var decodedUrl

    try {
        decodedUrl = decodeURIComponent(req.url);
    } catch (e) {
        decodedUrl = req.url;
    }

    return url.parse(decodedUrl, true);
};

util.log = function() {
  if (process.env.DISABLE_LOGGING) {
    return;
  }

  console.log.apply(console.log, [new Date().toISOString()].concat(Array.prototype.slice.call(arguments, 0)));
};
