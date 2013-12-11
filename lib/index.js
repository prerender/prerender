var phantomCluster = require('phantom-cluster')
  , PrerenderServer = require('./server')
  , PrerenderClient = require('./client')
  , cluster = require('cluster');

// Starts either a server or client depending on whether this is a master or
// worker cluster process
module.exports = function(options) {
    var phantom = phantomCluster.createQueued(options);

    if(cluster.isMaster) {
        return new PrerenderServer(phantom);
    } else {
        return new PrerenderClient(phantom);
    }
};
