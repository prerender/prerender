/*jshint sub: true */
var url = require('url');

var util = exports = module.exports = {};

// Normalizes unimportant differences in URLs - e.g. ensures
// http://google.com/ and http://google.com normalize to the same string
util.normalizeUrl = function (u) {
    return url.format(url.parse(u, true));
};

// Gets the URL to prerender from a request, stripping out unnecessary parts
util.prepareState = function(req, doubleEncode) {
    var decodedUrl
      , fragment
      , parts;

    try {
        decodedUrl = decodeURIComponent(req.url);
    } catch (e) {
        decodedUrl = req.url;
    }

    parts = url.parse(decodedUrl, true);

    // Remove the _escaped_fragment_ query parameter
    if (parts.query && parts.query.hasOwnProperty('_escaped_fragment_')) {
        if (parts.query['_escaped_fragment_']) {
            parts.hash = '#!' + parts.query['_escaped_fragment_'];
        }
        fragment = parts.query['_escaped_fragment_'];
        delete parts.query['_escaped_fragment_'];
        delete parts.search;
    }
    // double uri encode unicode url parts to bypass phantomjs bug. add _double_encoded_ url param
    if (doubleEncode && parts.pathname.indexOf('%') >= 0) {
        parts.pathname = encodeURI(encodeURI(parts.pathname));
        parts.query['_double_encoded_'] = '1';
        delete parts.search;
    }

    var newUrl = url.format(parts);
    if (newUrl[0] === '/') { newUrl = newUrl.substr(1); }
    return {
        url: newUrl,
        start: new Date(),
        _escaped_fragment_: fragment
    };
};

util.log = function() {
  if (process.env.DISABLE_LOGGING) {
    return;
  }

  console.log.apply(console.log, [new Date().toISOString()].concat(Array.prototype.slice.call(arguments, 0)));
};
