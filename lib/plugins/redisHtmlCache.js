
var cache_manager = require('cache-manager');
var redis_store = require('cache-manager-redis');

module.exports = {
    init: function() {
        this.cache = cache_manager.caching({
            store: redis_store, 
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
            db: 0,
            ttl: process.env.REDIS_CACHE_TTL || 3600/*seconds*/
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
