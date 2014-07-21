var cluster = require('cluster')
  , os = require('os')
  , fs = require('fs')
  , path = require('path')
  , http = require('http')
  , _ = require('lodash')
  , basename = path.basename;

var config = require('config');
var debug = require('debug')('prerender');
var logger = require('./logger')();

var intervalId;
var RESTART = 86400000 / 2; // restart master process every 12 hours
var TIMEOUT = 5000; // Wait 5 seconds for worker disconnect
var workers = [];

function initInt() {
  clearInterval(intervalId);
  intervalId = setInterval(function () {
    console.log("Interval Restarting...");
    process.kill(process.pid, "SIGUSR2");
  }, RESTART);
}

// Starts either a server or client depending on whether this is a master or
// worker cluster process
exports = module.exports = function(options) {
  var port = options.port || config.port || 3000;

  if(!options.phantomBasePort) {
      options.phantomBasePort = config.phantom_cluster_base_port || 12300;
  }

  var server = require('./server');
  options.isMaster = cluster.isMaster;
  options.worker = cluster.worker;
  server.init(options);

  if (cluster.isMaster) {
    logger.info('master starting...');
    for (var i = 0; i < (options.workers || os.cpus().length); i += 1) {
      debug('starting worker thread #' + i);
      logger.info('starting worker thread #' + i);
      workers.push(cluster.fork());
    }

    initInt();

    process.on('SIGUSR2',function() {
      console.log("Got SIGUSR2 with " + workers.length + " workers");
      initInt();

      // Blank the worker list, but keep a copy for ourselves:
      var copyWorkers = workers.slice();
      workers = [];

      copyWorkers.forEach(function (worker) {
        console.log("Disconnecting " + worker.id);
        worker.disconnect();
        var savedTimeout = setTimeout(function () {
          console.log(worker.id + " not responding, destroying.");
          worker.forced_death = true;
          worker.destroy();
          clearTimeout(savedTimeout);
        }, TIMEOUT);

        worker.on('disconnect', function () {
          if (worker.forced_death) { 
            console.log("Forced death on disconnect " + worker.id);
            return; 
          }

          console.log(worker.id + " done.");
          worker.destroy();
          clearTimeout(savedTimeout);
        });

        var newWorker = cluster.fork();
        console.log('Pushing new worker: ' + newWorker.id);
        workers.push(newWorker);
      });
    });

    cluster.on('exit', function (worker, code, signal) {
      console.log('worker exit:', worker.id, code, signal);
      if (worker.suicide) { 
        console.log('exit - suicided worker: ' + worker.id);
        return; 
      }

      logger.error('worker ' + worker.id + ' died.');
      workers = workers.filter(function(existingWorker) { 
        return existingWorker.id !== worker.id; 
      });
      if (!worker.reloaded) {
        var newWorker = cluster.fork();
        console.log(worker.id + ' died - forking to: ' + newWorker.id);
        workers.push(newWorker);
      }
    });
  } else {
    var httpServer = http.createServer(_.bind(server.onRequest, server));

    httpServer.listen(port, function () {
      debug('Server running on port ' + port);
      logger.info('Server running on port ' + port);
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
