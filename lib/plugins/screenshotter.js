var crypto = require('crypto'),
    fs = require('fs'),
    path = require('path'),
    url = require('url'),
    zlib = require('zlib');

var dirPath = process.env.SCREENSHOT_TMP_DIR || '/tmp/'; 
var reapInterval = process.env.SCREENSHOT_REAP_INTERVAL || 60000;

var defaultOutputFormat = 'png',
    defaultFormat = 'Letter',
    defaultOrientation = 'portrait',
    defaultMargin = {top: '5mm', bottom: '5mm'},
    defaultWidth = 660,
    defaultHeight = 718;

var tmpFiles = {};

module.exports = {

    init: function() {
      setInterval(utils.unlinkOldFiles.bind(this, dirPath, reapInterval));
    },

    onPhantomPageCreate: function(phantom, req, res, next) {
      var parts = url.parse(req.url, true);
      var outputFormat = parts.query.outputFormat || defaultOutputFormat;
      
      // Set url and headers for phantom GET request
      req.prerender.url = parts.query.url;
      var headers = parts.query.headers;
      if (typeof headers === 'string') {
        req.prerender.page.setHeaders(JSON.parse(headers));
      }
      
      // Set PDF and PNG phantom formatting
      var width = parts.query.width || defaultWidth,
          height = parts.query.height || defaultHeight,
          clipRect = parts.query.clipRect;
      if (width && height) {
        req.prerender.page.set('viewportSize', {width: width, height: height});
      } 
      if (typeof clipRect === 'string') {
        req.prerender.page.set('clipRect', JSON.parse(clipRect));
      }

      // Set PDF-specific phantom formatting 
      if (outputFormat === 'pdf') {
        var format = parts.query.pdfFormat || defaultFormat,
            wxh = format.split('*'),
            orientation = parts.query.pdfOrientation || defaultOrientation,
            margin = parts.query.pdfMargin || defaultMargin;

        if (typeof margin === 'string' && margin.indexOf('{') > -1) {
          margin = JSON.parse(margin);
        }
        var footer;
        if (parts.query.pdfFooter) {
          footer = JSON.parse(parts.query.pdfFooter);
          // function given to phantom.callback() is stringified and recompiled in phantom context without dependencies (closure variables), so build function as string.
          // http://stackoverflow.com/questions/27044459/how-to-set-custom-header-and-footer-content-by-using-phantom-package-in-nodejs
          var footerFunc = 'function(pageNum, numPages) { var x = \'' + footer.contents.replace(/[\r\n]+/gm, '') + '\'; return x.replace("{#pageNum}", pageNum).replace("{#numPages}", numPages);}';
          footer.contents = phantom.callback(footerFunc);
        }
        var paperSize = wxh.length === 2 ? {
          width: wxh[0],
          height: wxh[1],
          margin: margin,
          footer: footer
        } : {
          format: format,
          orientation: orientation,
          margin: margin,
          footer: footer
        };
        req.prerender.page.set('paperSize', paperSize);
      }
      next();
    },

    afterPhantomRequest: function(req, res, next) {
      var parts = url.parse(req.url, true);
      var outputFormat = parts.query.outputFormat || defaultOutputFormat;
      var encoding = req.headers['accept-encoding'];
      var fileName = 'screenshot_' + utils.md5(parts.query.headers + req.url) + '.' + outputFormat;
      var filePath = dirPath + fileName;
      tmpFiles[fileName] = true;
      req.prerender.page.render(filePath, function() {
        var readStream = fs.createReadStream(filePath);
        var responseHeaders = {'Content-Type': outputFormat === 'pdf' ? 'application/pdf' : 'image/png'};
        if (typeof encoding === 'string' && encoding.indexOf('gzip') > -1) {
          responseHeaders['Content-Encoding'] = 'gzip';
          readStream = readStream.pipe(zlib.createGzip());
        }
        res.writeHead(200, responseHeaders);
        readStream.pipe(res);
        readStream.on('end', function() {
          utils.unlinkFile(filePath);
          delete tmpFiles[fileName];
          var ms = Date.now() - req.prerender.start.getTime();
          console.log('got', req.prerender.statusCode, 'in', ms + 'ms', 'for', req.prerender.url);
          next();
        });
      });
    },

    beforeKillPhantomJS: function(next) {
      Object.keys(tmpFiles).forEach(function(key) {
        try {
          utils.unlinkFile(dirPath + key);
          delete tmpFiles[key];
        }
        catch (e) {
          console.log('ERROR deleting screenshot: ' + key + ', Error=' + e); 
        }
        
      });
      next();
    }
};

var utils = {

  unlinkFile: function(filePath) {
    if (filePath) {
      try {
        var stats = fs.statSync(filePath);
        if (stats.isFile()) {
          fs.unlinkSync(filePath);
        }
      }
      catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
        console.log('Tried erasing file ' + filePath + ' but ENOENT thrown, skipping...');
      }
    }
  },

  unlinkOldFiles: function(dirPath, ttl) {
    ttl = ttl || 0;
    var expireTime = Date.now() - ttl;
    fs.readdirSync(dirPath).forEach(function(file) {
      if (file.indexOf('screenshot_') === 0) {
        try {
          var filePath = path.join(dirPath, file);
          var stats = fs.statSync(filePath);
          if (stats.isFile() && expireTime > stats.mtime.getTime()) {
            console.log('Erasing file: ' + filePath + ' (older than ' + ttl + 'ms)');
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          if (e.code !== 'ENOENT') {
            throw e;
          }
          console.log('Tried erasing file ' + filePath + ' but ENOENT thrown, skipping...');
        }
      }
    });
  },

  md5: function(str) {
    return crypto.createHash('md5').update(str).digest('hex');
  }
};
