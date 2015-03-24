var aws = require('aws-sdk')
  , zlib = require('zlib');

// refresh the cache after responding over this % of the TTL has passed
var THRU_TTL_PERCENTAGE = parseFloat(process.env.S3TC_THRU_TTL_PERCENTAGE || 0.9);
// do not use the cached resource if over this % of the TTL has passed
var INVALID_TTL_PERCENTAGE = parseFloat(process.env.S3TC_INVALID_TTL_PERCENTAGE || 1e5);
var DEFAULT_TTL = process.env.S3TC_DEFAULT_TTL || 86400;
var SCRIPT_RE = /<script(?:.*?)>(?:[\S\s]*?)<\/script>/gi;
var GZIP_LEVEL = zlib[process.env.S3TC_GZIP_LEVEL || 'Z_BEST_SPEED'];

// before version v0.11.1 gzip() didn't support options.
var gzip = zlib.gzip;
if (process.version.match(/^v0[.](\d[.]|10[.]|11[.]0)/)) {
    gzip = function gzip(buffer, opts, callback) {
        return zlib.gzip(buffer, callback);
    };
}

module.exports = {
  init: function() {
    if (process.env.AWS_CONFIG) {
      aws.config.loadFromPath(process.env.AWS_CONFIG);
    }

    var self = this;
    var hbp = process.env.S3TC_STRIP_HASH_BANG_PATTERN;
    this.stripHashBang = hbp === '*';
    if (hbp && !this.stripHashBang) {
      var parts = hbp.replace(/(^|[^\\])[/]/g, '$1\n').trim('\n').split('\n');
      this.stripHashBangRe = new RegExp(parts[0], parts[1]);
    } else {
      this.stripHashBangRe = null;
    }
    this.s3 = new aws.S3({params:{Bucket: process.env.S3TC_BUCKET_NAME}});
    this.s3Cache = {
      internalKey: function(key) {
        key = key.replace('://', ':');
        return process.env.S3TC_KEY_PREFIX ? process.env.S3TC_KEY_PREFIX + '/' + key : key;
      },
      get: function(key, callback) {
        self.s3.getObject({Key: self.s3Cache.internalKey(key)}, callback);
      },
      set: function(key, value, ttl, callback) {
        gzip(value, {level: GZIP_LEVEL}, function(err, result) {
          if (!err) {
            var request = self.s3.putObject({
              Key: self.s3Cache.internalKey(key),
              ContentEncoding: 'gzip',
              ContentType: 'text/html;charset=UTF-8',
              StorageClass: 'REDUCED_REDUNDANCY',
              Metadata: {ttl: (ttl || DEFAULT_TTL).toString()},
              Body: result
            }, callback);

            if (!callback) {
              request.send();
            }
          }
        });
      }
    };
  },

  beforePhantomRequest: function(req, res, next) {
    if (req.method !== 'GET') {
      return next();
    }
    if ((this.stripHashBang || this.stripHashBangRe) && req.prerender.url.indexOf('#!?') >= 0) {
      if (this.stripHashBang || this.stripHashBangRe.test(req.prerender.url)) {
        req.prerender.url = req.prerender.url.replace(/#![?].*$/, '');
      }
    }

    this.s3Cache.get(req.prerender.url, function(err, result) {
      var ttl, thru = true, ok = true;
      if (err) {
        console.log('cache miss:', req.prerender.url);
      } else if (result) {
        if (result.Metadata && result.Metadata.ttl) {
          var now = Date.now(), modified = new Date(result.LastModified).getTime();
          ttl = parseInt(result.Metadata.ttl) * 1000;
          ok = now < (modified + ttl * INVALID_TTL_PERCENTAGE);
          thru = !ok || now > (modified + ttl * THRU_TTL_PERCENTAGE);
        }
        console.log('cache hit:', req.prerender.url, ' --  OK =', ok, 'THRU =', thru);

        if (ok) {
          res.setHeader('Content-Encoding', 'gzip');
          res.send(200, {documentHTML: result.Body, gzipped: true});
          // continue, but annotate the response: content already sent.
          res.s3tcResponded = true;
        }
      }
      if (thru) {
        next();
      }
    });
  },

  afterPhantomRequest: function(req, res, next) {
    var pre = req.prerender, cache = this.s3Cache, ttl;

    if (200 <= pre.statusCode && pre.statusCode <= 299) {
      // strip script tags before caching or responding
      var matches = pre.documentHTML.toString().match(SCRIPT_RE);
      if (matches && matches.length) {
        pre.documentHTML = pre.documentHTML.toString();
        for (var i = 0, mlen = matches.length; i < mlen; ++i) {
          if (matches[i].indexOf('application/ld+json') === -1) {
            pre.documentHTML = pre.documentHTML.replace(matches[i], '');
          }
        }
      }

      // determine the lifetime of the page
      if (pre.headers && pre.headers.length) {
        for (var i = 0, h, m, hlen = pre.headers.length; i < hlen ; ++i) {
          h = pre.headers[i];
          if (h.name === 'Cache-Control' && h.value && h.value.indexOf('max-age') >= 0) {
            m = h.value.match(/.*max-age *= *(\d+).*/i);
            if (m) {
              ttl = parseInt(m[1]);
              break;
            }
          } else if (h.name === 'Expires' && h.value) {
            ttl = parseInt((new Date(h.value).getTime() - Date.now()) / 1000);
          }
        }
      }

      // populate the cache async
      setTimeout(function() {
        cache.set(pre.url, pre.documentHTML, ttl, function(err, result) {
          if (err) { console.error('issue populating cache:', err); }
        });
      }, 1);
    }

    if (!res.s3tcResponded) {
      next();
    }
  }
};
