var cache_manager = require('cache-manager');
var config = require('config');
var debug = require('debug')('prerender-s3HtmlCache');
var AWS = new require('aws-sdk');
var logger = require('../logger')('s3HtmlCache');

var THRESHOLD_BYTES = 250;

AWS.config.update({
  accessKeyId: config.awsAccessKey,
  secretAccessKey: config.awsSecretKey,
  region: 'us-east-1'
});

var s3 = new AWS.S3({ params: { Bucket: config.s3Bucket } });

module.exports = {
    init: function() {
      this.cache = cache_manager.caching({
          store: s3_cache
      });
    },
    beforePhantomRequest: function(req, res, next) {
      if(req.method !== 'GET') {
          return next();
      }

      if(req.headers['cache-control'] === 'no-cache') {
        logger.info('Force cache update %s', req.prerender.url);
        return next();
      }

      this.cache.get(req.prerender.url, function (err, result) {
        if (!err && result) {
          debug('cache hit', req.prerender.url);
          logger.info('cache hit', req.prerender.url);
          res.send(200, result.Body);
        } else {
          debug('cache miss', req.prerender.url);
          logger.info('cache miss', req.prerender.url);
          next();
        }
      });
    },
    afterPhantomRequest: function(req, res, next) {
      debug('cache set: %s', req.prerender.url);
      logger.info('cache set: %s', req.prerender.url);

      if (req.prerender.documentHTML.length < THRESHOLD_BYTES) {
        logger.warn('Skipping S3 cache setting because HTML suspiciously small! %d bytes - %s', req.prerender.documentHTML, req.prerender.url);        
      }
      else {
        this.cache.set(req.prerender.url, req.prerender.documentHTML);
      }

      next();
    }
};


var s3_cache = {
    get: function(key, callback) {
      key = convertKey(key);
      if (process.env.s3_prefix_key) {
        key = process.env.s3_prefix_key + '/' + key;
      }

      s3.getObject({
        Key: key
      }, callback);
    },
    set: function(key, value, callback) {
      key = convertKey(key);
      if (process.env.s3_prefix_key) {
        key = process.env.s3_prefix_key + '/' + key;
      }

      var request = s3.putObject({
        Key: key,
        ContentType: 'text/html;charset=UTF-8',
        StorageClass: 'REDUCED_REDUNDANCY',
        Body: value
      }, callback);

      if (!callback) {
        request.send();
      }
    }
};

function convertKey(key) {
  return key.replace(/\//g, '-');
}
