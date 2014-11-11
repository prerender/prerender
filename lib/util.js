/*jshint sub: true */
var url = require('url');
var logger = require('./logger')('prerender');
var _s = require('underscore.string');

var util = module.exports = {};

// Normalizes unimportant differences in URLs - e.g. ensures
// http://google.com/ and http://google.com normalize to the same string
util.normalizeUrl = function (u) {
    return url.format(url.parse(u, true));
};

// Gets the URL to prerender from a request, stripping out unnecessary parts
util.getUrl = function (req) {
    var decodedUrl
      , parts;

    try {
        decodedUrl = decodeURIComponent(req.url);
    } catch (e) {
        decodedUrl = req.url;
    }
    decodedUrl = _s.trim(decodedUrl, '/');
    parts = url.parse(decodedUrl, true);
    // Remove the _escaped_fragment_ query parameter
    if (parts.query.hasOwnProperty('_escaped_fragment_')) {
        if(parts.query['_escaped_fragment_']) parts.hash = '#!' + parts.query['_escaped_fragment_'];
        delete parts.query['_escaped_fragment_'];
        delete parts.search;
    }

    var newUrl = url.format(parts);
    return newUrl;
};

util.log = function() {
    logger.info.apply(logger.info, arguments);
};
