var aws = require('aws-sdk')
  , zlib = require('zlib');

/**
 * s3 Thru Cache Plugin
 * -------------------
 * When a GET request is made to a URL with an escaped fragment, the following occurs:
 *
 * 
 * BEFORE PHANTOM REQUEST:
 *
 *  If the requested page is not in the cache ("cache miss"): 
 *     Make a phantom request 
 *  
 *  If the requested page is in the cache ("cache hit"): 
 *     If cached page is fresh: 
 *         Respond with cached page
 *         If cached page is starting to stale:
 *             Queue page for recaching
 *         We responded from cache, so check Q for low priority work 
 *     If cached page is not fresh:
 *         Make a phantom request
 *
 *
 * AFTER PHANTOM REQUEST:
 *  
 *  "high priority work" is work sent to phantom immediately
 *  "lower priority work" is work done out of the Q
 *  
 *  If phantom just finished processing "low priority work":
 *     Adjust low priority flag
 *  If phantom just finished processing "high priority" work:
 *     Adjust high priority counter
 *     Next() - continue prerender work flow
 *
 *  Check Q for low priority work
 *  
 * CHECKING THE Q FOR LOW PRIORITY WORK:
 *    
 *  When the Q is checked, low priority work will only be dequeued if:
 *     1. Active High Priority Count <= 0 AND
 *     2. Active Low Priority Work = False AND
 *     3. Q.length > 0
 *
 *  Only one item is dequeued at the time.
 *
 *  
 */

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

var s3tc = module.exports = {
  activeHighPriorityUrlCount: 0,
  activeLowPriorityWork: null,
  cachingQueue: [],

  init: function() {
    if (process.env.AWS_CONFIG) {
      aws.config.loadFromPath(process.env.AWS_CONFIG);
    }

    var hbp = process.env.S3TC_STRIP_HASH_BANG_PATTERN;
    s3tc.stripHashBang = hbp === '*';
    if (hbp && !s3tc.stripHashBang) {
      var parts = hbp.replace(/(^|[^\\])[/]/g, '$1\n').trim('\n').split('\n');
      s3tc.stripHashBangRe = new RegExp(parts[0], parts[1]);
    } else {
      s3tc.stripHashBangRe = null;
    }
    this.s3 = new aws.S3({params:{Bucket: process.env.S3TC_BUCKET_NAME}});
  },

  s3Cache: {
    internalKey: function(key) {
      key = key.replace('://', ':');
      return process.env.S3TC_KEY_PREFIX ? process.env.S3TC_KEY_PREFIX + '/' + key : key;
    },
    get: function(key, callback) {
      s3tc.s3.getObject({Key: s3tc.s3Cache.internalKey(key)}, callback);
    },
    set: function(key, value, meta, callback) {
      gzip(value, {level: GZIP_LEVEL}, function(err, result) {
        if (!err) {
          var request = s3tc.s3.putObject({
            Key: s3tc.s3Cache.internalKey(key),
            ContentEncoding: 'gzip',
            ContentType: 'text/html;charset=UTF-8',
            StorageClass: 'REDUCED_REDUNDANCY',
            Metadata: meta,
            Body: result
          }, callback);

          if (!callback) {
            request.send();
          }
        }
      });
    }
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
      
      if (err || !result || !result.Metadata) {
        // cache miss: continue to phantomjs immediately
        console.log('cache miss:', req.prerender.url);
        ++s3tc.activeHighPriorityUrlCount;
        next();
      } else {
        // cache hit: determine if cached content is "fresh" & if we need to re-cache

        var now = Date.now(),
            modified = new Date(result.LastModified).getTime(),
            ttl = parseInt(result.Metadata.ttl || 300) * 1000,
            queued = false;

        if (now < (modified + ttl * INVALID_TTL_PERCENTAGE)) {
          // cache is fresh: respond with cached content
          res.setHeader('Content-Encoding', 'gzip');
          if (result.Metadata.cachecontrol) {
            res.setHeader('Cache-Control', result.Metadata.cachecontrol);
          }
          if (result.Metadata.expires) {
            res.setHeader('Expires', result.Metadata.expires);
          }
          res.send(200, {documentHTML: result.Body, gzipped: true});
          res.s3tcResponded = true;

          if (now > (modified + ttl * THRU_TTL_PERCENTAGE)) {
            // cache is starting to stale: queue for re-caching
            s3tc.cachingQueue.push(next);
            queued = true;
          }
          console.log('cache hit: ', req.prerender.url, ' ok:', res.s3tcResponded, ' queued:', queued);
          // we responded from cache, check for low priority phantom work (if done with high prio)
          s3tc.primeCacheAsync()
        } else {
          // cache is stale: continue to phantomjs immediately
          console.log('cache hit (stale): ', req.prerender.url);
          ++s3tc.activeHighPriorityUrlCount;
          next();
        }
      }
    });
  },

  afterPhantomRequest: function(req, res, next) {
    var pre = req.prerender, ttl;

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
      var cacheControl, expires;
      if (pre.headers && pre.headers.length) {
        for (var i = 0, h, m, hlen = pre.headers.length; i < hlen ; ++i) {
          h = pre.headers[i];
          if (h.name === 'Cache-Control' && h.value) {
            cacheControl = h.value;
            if (cacheControl.indexOf('max-age') >= 0) {
              m = cacheControl.match(/.*max-age *= *(\d+).*/i);
              if (m) {
                ttl = parseInt(m[1]);
              }
            }
          } else if (h.name === 'Expires' && h.value) {
            expires = h.value;
            // give priority to any ttl computed from Cache-Control: max-age
            ttl = ttl || parseInt((new Date(expires).getTime() - Date.now()) / 1000);
          }
        }
      }

      // write to s3 async
      setTimeout(function() {
        var meta = {
          cachecontrol: cacheControl || '',
          expires: expires || '',
          ttl: (ttl || DEFAULT_TTL).toString()
        };
        s3tc.s3Cache.set(pre.url, pre.documentHTML, meta, function(err, result) {
          if (err) { console.error('issue populating cache:', err); }
        });
      }, 1);
    }

    if (res.s3tcResponded) {
      // we've previously responded: this is the completion of low priority work
      s3tc.activeLowPriorityWork = null;
    } else {
      // completion of high priority work. next() will respond to client
      --s3tc.activeHighPriorityUrlCount;
      next();
    }

    // check for low priority work
    this.primeCacheAsync();
  },

  primeCacheAsync: function() {
    console.log('Attempting to extract from Queue.  Q =', s3tc.cachingQueue.length,
                'activeHighPriorityUrlCount =', s3tc.activeHighPriorityUrlCount,
                'activeLowPriorityWork =', Boolean(s3tc.activeLowPriorityWork))

    if (s3tc.activeHighPriorityUrlCount <= 0 && !s3tc.activeLowPriorityWork && s3tc.cachingQueue.length) {
      console.log('resume low-priority work: Q =', s3tc.cachingQueue.length);
      s3tc.activeLowPriorityWork = s3tc.cachingQueue.pop();
      setTimeout(function() {
        // resume the next phantom render + cache update. call the de-queued 'next()'
        // work-state will be set to null in afterPhantomRequest() & will not respond to the client.
        // this request was already responded to from 'stale' cache in beforePhantomRequest()
        s3tc.activeLowPriorityWork();
      }, 1);
    } else if (s3tc.activeHighPriorityUrlCount > 5) {
      console.log('phantomjs back-log: active-high-priority =', s3tc.activeHighPriorityUrlCount,
                  'active-low-priority =', Boolean(s3tc.activeLowPriorityWork),
                  'Q =', s3tc.cachingQueue.length);
    }
  },
};
