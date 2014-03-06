var cluster = require('cluster')
  , os = require('os')
  , fs = require('fs')
  , path = require('path')
  , http = require('http')
  , _ = require('lodash')
  , basename = path.basename;

// Starts either a server or client depending on whether this is a master or
// worker cluster process
exports = module.exports = function(options) {
    var _this = this;
    var port = options.port || process.env.PORT || 3000;

    var server = require('./server');
    options.isMaster = cluster.isMaster;
    options.worker = cluster.worker;
    server.init(options);

    if(cluster.isMaster) {

        for (i = 0; i < (options.workers || os.cpus().length); i += 1) {
            console.log('starting worker thread #' + i);
            cluster.fork();
        }
        
        cluster.on('exit', function (worker) {

            console.log('worker ' + worker.id + ' died.');
            // spin up another to replace it
            console.log('Restarting worker thread...');
            cluster.fork();
        });
    } else {
        var httpServer = http.createServer(_.bind(server.onRequest, server));

        httpServer.listen(port, function () {
            console.log('Server running on port ' + port);
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