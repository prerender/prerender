var cluster = require('cluster')
  , os = require('os')
  , fs = require('fs')
  , path = require('path')
  , http = require('http')
  , _ = require('lodash')
  , util = require('./util')
  , basename = path.basename;

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

        for (var i = 0; i < (options.workers || os.cpus().length); i += 1) {
            util.log('starting worker thread #' + i);
            cluster.fork();
        }

        cluster.on('exit', function (worker) {
            if (worker.suicide === true) return;

            util.log('worker ' + worker.id + ' died, restarting!');
            cluster.fork();
        });

        process.on('SIGTERM', function () {
            util.log('Master received SIGTERM signal');
            for (var id in cluster.workers) {
                util.log('Terminating worker #' + id);
                cluster.workers[id].kill();
            }
        });
    } else {
        var httpServer = http.createServer(_.bind(server.onRequest, server));

        httpServer.listen(port, hostname, function () {
            util.log('Server running on port ' + port);
        });

        process.on('SIGTERM', function () {
            util.log('Worker received SIGTERM signal');
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
