var phantomCluster = require('phantom-cluster')
  , PrerenderServer = require('./server')
  , PrerenderClient = require('./client')
  , cluster = require('cluster');

module.exports = function(options) {
    var phantom = phantomCluster.createQueued(options);

    if(cluster.isMaster) {
        return new PrerenderServer(phantom);
    } else {
        return new PrerenderClient(phantom);
    }
};
