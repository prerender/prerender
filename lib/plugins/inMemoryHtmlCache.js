var cacheManager = require('cache-manager');

module.exports = {
    init: function() {
        this.cache = cacheManager.caching({
            store: 'memory', max: process.env.CACHE_MAXSIZE || 100, ttl: process.env.CACHE_TTL || 60/*seconds*/
        });
    },

    requestReceived: function(req, res, next) {
        this.cache.get(req.prerender.url, function (err, result) {
            if (!err && result) {
                console.log('sending cached copy of ', req.prerender.url)
                req.prerender.responseSent = true;
                req.prerender.fileSystemCached = true;
                res.send(200, result);
                return next();
            } else {
                next();
            }
        });
    },

    pageLoaded: function(req, res, next) {
        if (!req.prerender.fileSystemCached) {
            console.log('saving to cache', req.prerender.url);
            this.cache.set(req.prerender.url, req.prerender.content);
        }
        next();
    }
}