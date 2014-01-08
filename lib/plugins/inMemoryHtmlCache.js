var cache_manager = require('cache-manager');

module.exports = {
    init: function() {
        this.cache = cache_manager.caching({
            store: 'memory', max: 100, ttl: 60/*seconds*/
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

    afterPhantomRequest: function(phantom, context, next) {
        this.cache.set(context.request.url, context.response.documentHTML);
        next();
    }
}