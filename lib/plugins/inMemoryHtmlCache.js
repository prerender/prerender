var cacheManager = require('cache-manager');

module.exports = {
    init: function() {
        this.cache = cacheManager.caching({
            store: 'memory', max: process.env.CACHE_MAXSIZE || 100, ttl: process.env.CACHE_TTL || 60/*seconds*/
        });
    },

    beforePhantomRequest: function(req, res, next) {
        this.cache.get(req.prerender.url, function (err, result) {
            if (!err && result) {
                res.send(200, result);
            } else {
                next();
            }
        });
    },

    afterPhantomRequest: function(req, res, next) {
        this.cache.set(req.prerender.url, req.prerender.documentHTML);
        next();
    }
}
