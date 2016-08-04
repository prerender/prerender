var cluster = require('cluster')
  , os = require('os')
  , fs = require('fs')
  , path = require('path')
  , http = require('http')
  , _ = require('lodash')
  , util = require('./util')
  , basename = path.basename
  , onExit = require('signal-exit');

// Starts either a server or client depending on whether this is a master or
// worker cluster process
exports = module.exports = function(options) {
    var port = options.port || process.env.PORT || 3000;
    var hostname = options.hostname || process.env.NODE_HOSTNAME || undefined;

    var server = require('./server');
    options.isMaster = cluster.isMaster;
    options.worker = cluster.worker;
    server.init(options);

    if(cluster.isMaster) {

        var workersPhantomjsPid = {};

        for (var i = 0; i < (options.workers || os.cpus().length); i += 1) {
            util.log('starting worker thread #' + i);
            var worker = cluster.fork();

            worker.on('message', function(msg) {
                workersPhantomjsPid[this.id] = msg['phantomjsPid'];
            });
        }

        cluster.on('exit', function (worker) {
            if (worker.suicide === true || worker.exitedAfterDisconnect === true) return;

            if(workersPhantomjsPid[worker.id]) {
                process.kill(workersPhantomjsPid[worker.id], 'SIGKILL');
                delete workersPhantomjsPid[worker.id];
            }

            util.log('worker ' + worker.id + ' died, restarting!');
            cluster.fork();
        });
    } else {
        var httpServer = http.createServer(_.bind(server.onRequest, server));

        httpServer.listen(port, hostname, function () {
            util.log('Server running on port ' + port);
        });

        onExit(function() {
            util.log('Terminating worker #' + cluster.worker.id);
            server.exit();
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
