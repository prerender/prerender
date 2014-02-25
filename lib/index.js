var phantomCluster = require('phantom-cluster')
  , PrerenderEngine = require('./engine')
  , PrerenderServer = require('./server')
  , PrerenderClient = require('./client')
  , cluster = require('cluster')
  , fs = require('fs')
  , path = require('path')
  , basename = path.basename;

// Starts either a server or client depending on whether this is a master or
// worker cluster process
function create(options) {
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

exports.create = create;
exports.PrerenderEngine = PrerenderEngine;
exports.PrerenderServer = PrerenderServer;
exports.PrerenderClient = PrerenderClient;
