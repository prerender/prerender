var phantomCluster = require('phantom-cluster')
  , PrerenderServer = require('./server')
  , PrerenderClient = require('./client')
  , cluster = require('cluster')
  , fs = require('fs')
  , path = require('path')
  , basename = path.basename;

// Starts either a server or client depending on whether this is a master or
// worker cluster process
exports = module.exports = function(options) {
    var phantom = phantomCluster.createQueued(options);

    if(cluster.isMaster) {
        return new PrerenderServer(phantom);
    } else {
        return new PrerenderClient(phantom);
    }
};

fs.readdirSync(__dirname + '/plugins').forEach(function(filename){
  if (!/\.js$/.test(filename)) return;
  var name = basename(filename, '.js');
  function load(){ return require('./plugins/' + name); }
  Object.defineProperty(exports, name, {value: load});
});