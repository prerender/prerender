// Provides common functionality - i.e. plugins - for clients and servers
function PrerenderEngine(phantom) {
    this.plugins = this.plugins || [];
    this.phantom = phantom;
}

// Adds a plugin to this engine
PrerenderEngine.prototype.use = function(plugin) {
    this.plugins.push(plugin);
    if (typeof plugin.init === 'function') plugin.init(this);
};

// Executes `methodName` on each plugin in a manner similar to express
// middleware
PrerenderEngine.prototype._pluginEvent = function(methodName, args, callback) {
    var _this = this
      , index = 0
      , next;

    next = function() {
        var layer = _this.plugins[index++];
        if (!layer) return callback();

        var method = layer[methodName];

        if (method) {
            method.apply(layer, args);
        } else {
            next();
        }
    }
    
    args.push(next);
    next();
};

module.exports = PrerenderEngine;
