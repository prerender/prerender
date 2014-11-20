var cluster = require('cluster')
  , os = require('os')
  , fs = require('fs')
  , path = require('path')
  , http = require('http')
  , _ = require('lodash')
  , basename = path.basename;

var config = require('config');
var debug = require('debug')('prerender');
var logger = require('./logger')('index');

var intervalId;
var RESTART = 86400000 / 2; // restart master process every 12 hours
var TIMEOUT = 5000; // Wait 5 seconds for worker disconnect
var MEM_CHECK_INT = 86400000 / 8;
var MEM_BYTES_THRES_MB = 400;
var workers = [];

setInterval(function() {
  var mbBytesFree = os.freemem() / 1024/ 1024;
  if (mbBytesFree < MEM_BYTES_THRES_MB) {
    logger.error('Memory check alert! Free memory: %dMB'.red, mbBytesFree);

    try {
      logger.info('Killing all phantomjs ...');
      require('child_process').spawn('pkill', ['phantomjs']);
      logger.debug('Killed phantomjs');
    } catch(e) {
      logger.debug('Error killing phantomjs:', e);
    }

    var newFree = os.freemem() / 1024/ 1024;
    logger.error('Memory check - Free memory: %dMB (diff: %dMB)', newFree, newFree - mbBytesFree);
  }
}, MEM_CHECK_INT);

function initInt() {
  clearInterval(intervalId);
  intervalId = setInterval(function () {
    logger.info("Interval Restarting...");
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
    logger.info('master starting... pid: [%s]', process.pid);
    for (var i = 0; i < (options.workers || os.cpus().length); i += 1) {
      debug('starting worker thread #' + i);
      logger.info('starting worker thread #' + i);
      workers.push(cluster.fork());
    }

    initInt();

    process.on('SIGUSR2',function() {
      logger.info("Got SIGUSR2 with " + workers.length + " workers");

      // try {
      //   logger.info('Killing all phantomjs ...');
      //   require('child_process').spawn('pkill', ['phantomjs']);
      //   logger.info('Killed phantomjs');
      // } catch(e) {
      //   logger.error('Error killing phantomjs:', e);
      // }

      initInt();

      // Blank the worker list, but keep a copy for ourselves:
      var copyWorkers = workers.slice();
      workers = [];

      copyWorkers.forEach(function (worker) {
        logger.info("Disconnecting " + worker.id);
        worker.disconnect();
        var savedTimeout = setTimeout(function () {
          logger.info(worker.id + " not responding, destroying.");
          worker.forced_death = true;
          worker.destroy();
          clearTimeout(savedTimeout);
        }, TIMEOUT);

        worker.on('disconnect', function () {
          if (worker.forced_death) {
            logger.info("Forced death on disconnect " + worker.id);
            return;
          }

          logger.info(worker.id + " done.");
          worker.destroy();
          clearTimeout(savedTimeout);
        });

        var newWorker = cluster.fork();
        logger.info('Pushing new worker: ' + newWorker.id);
        workers.push(newWorker);
      });
    });

    cluster.on('exit', function (worker, code, signal) {
      logger.info('worker exit:', worker.id, code, signal);
      if (worker.suicide) {
        logger.error('NOTE - suicided worker: ' + worker.id);
      }
      logger.error('worker ' + worker.id + ' died.');
      workers = workers.filter(function(existingWorker) {
        return existingWorker.id !== worker.id;
      });
      if (!worker.reloaded) {
        var newWorker = cluster.fork();
        logger.info(worker.id + ' died - forking to: ' + newWorker.id);
        workers.push(newWorker);
      }
    });
  } else {
    var httpServer = http.createServer(_.bind(server.onRequest, server));

    httpServer.listen(port, function () {
      logger.info('Server running on port [%s] pid: [%s]', port, process.pid);
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
