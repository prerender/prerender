var util = require('util'),
    winston = require('winston'),
    Papertrail = require('winston-papertrail').Papertrail;
var config = require('config');

function setupFormating(fn, namespace) {
  if (namespace) {
    namespace = '[' + namespace + '] ';
  }
  else {
    namespace = '';
  }
  return function() {
    var str = util.format.apply(util, arguments);

    fn(namespace + str, {});
  };
}

function pad(num, digits) {
  var value = Math.pow(10, digits) + num;
  return value.toString().substring(1);
}

function timestamp() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2) + ' ' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2) + '.' + pad(d.getTime() % 1000, 3);
}

function configure (namespace) {
  var opts = config.logger;
  var transports = [];

  if (opts.papertrail) {
    transports.push(new Papertrail({
      host: opts.papertrail.host,
      port: opts.papertrail.port,
      program: opts.papertrail.program,
      logFormat: function(level, message) {
        if (namespace) {
          return '[' + level + '] ' + '[' + namespace + ']' + message;
        }
        else {
          return '[' + level + '] ' + message;
        }
      }
    }));
  }

  var logger = new winston.Logger({ transports: transports });
  var level = (opts.level || "debug").toLowerCase();

  if (opts.console) {
    logger.add(winston.transports.Console, { level: level, timestamp: timestamp, colorize: true });
  }
  if (opts.path) {
    var filename = opts.path;
    if (filename.indexOf('/') !== 0) {
      filename = __dirname + "/../" + filename;
    }
    logger.add(winston.transports.File, { level: level, timestamp: timestamp, filename: filename, json: false });
  }

  logger.setLevels({ debug: 0, info: 1, warn: 2, error: 3 });

  logger.debug = setupFormating(logger.debug, namespace);
  logger.info = setupFormating(logger.info, namespace);
  logger.warn = setupFormating(logger.warn, namespace);
  logger.error = setupFormating(logger.error, namespace);

  // Wrappers
  logger.inspect = function(o) {
    logger.debug(JSON.stringify(o, null, '\t'));
  };

  logger.info("Logging enabled. Level:[%s] Location:[%s] Transports:[%d]", level, opts.path, transports.length);

  return logger;
}

var LOGGER = {};
module.exports = function(namespace) {
  namespace = namespace || 'default';
  if (!LOGGER[namespace]) {
    LOGGER[namespace] = configure(namespace);
  }
  return LOGGER[namespace];
};
