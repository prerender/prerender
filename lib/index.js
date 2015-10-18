var cluster = require('cluster')
  , os = require('os')
  , fs = require('fs')
  , path = require('path')
  , http = require('http')
  , _ = require('lodash')
  , util = require('./util')
  , basename = path.basename;

// fix resource leak, per:
// https://github.com/nodejs/node-v0.x-archive/issues/9409#issuecomment-84038111
function workAround(worker) {
  var listeners = null;

  listeners = worker.process.listeners('exit')[0];
  var exit = listeners[Object.keys(listeners)[0]];

  listeners = worker.process.listeners('disconnect')[0];
  var disconnect = listeners[Object.keys(listeners)[0]];

  worker.process.removeListener('exit', exit);
  worker.process.once('exit', function(exitCode, signalCode) {
    if (worker.state != 'disconnected') {
      disconnect();
    }
    exit(exitCode, signalCode);
  });
}


// Starts either a server or client depending on whether this is a master or
// worker cluster process
exports = module.exports = function(options) {
    var port = options.port || process.env.PORT || 3000;

    if(!options.phantomBasePort) {
        options.phantomBasePort = process.env.PHANTOM_CLUSTER_BASE_PORT || 12300;
    }

    var server = require('./server');
    options.isMaster = cluster.isMaster;
    options.worker = cluster.worker;
    server.init(options);

    if(cluster.isMaster) {

        for (var i = 0; i < (options.workers || os.cpus().length); i += 1) {
            util.log('starting worker thread #' + i);
            workAround(cluster.fork());
        }

        cluster.on('exit', function (worker) {
            util.log('worker ' + worker.id + ' died, restarting!');
            workAround(cluster.fork());
        });
    } else {
        var httpServer = http.createServer(_.bind(server.onRequest, server));

        httpServer.listen(port, function () {
            util.log('Server running on port ' + port);
        });
    }

    return server;
};

fs.readdirSync(__dirname + '/plugins').forEach(function(filename){
    if (!/\.js$/.test(filename)) return;
    var name = basename(filename, '.js');
    function load(){ return require('./plugins/' + name); }
    Object.defineProperty(exports, name, {value: load});
});
