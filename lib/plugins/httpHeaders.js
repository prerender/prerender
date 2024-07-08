var he = require('he');

module.exports = {
  pageLoaded: (req, res, next) => {
    if (req.prerender.content && req.prerender.renderType == 'html') {
      let statusMatch =
          /<meta[^<>]*(?:name=['"]prerender-status-code['"][^<>]*content=['"]([0-9]{3})['"]|content=['"]([0-9]{3})['"][^<>]*name=['"]prerender-status-code['"])[^<>]*>/i,
        headerMatch =
          /<meta[^<>]*(?:name=['"]prerender-header['"][^<>]*content=['"]([^'"]*?): ?([^'"]*?)['"]|content=['"]([^'"]*?): ?([^'"]*?)['"][^<>]*name=['"]prerender-header['"])[^<>]*>/gi,
        head = req.prerender.content.toString().split('</head>', 1).pop(),
        statusCode = 200,
        match;

      if ((match = statusMatch.exec(head))) {
        statusCode = match[1] || match[2];
        req.prerender.content = req.prerender.content
          .toString()
          .replace(match[0], '');
      }

      while ((match = headerMatch.exec(head))) {
        res.setHeader(match[1] || match[3], he.decode(match[2] || match[4]));
        req.prerender.content = req.prerender.content
          .toString()
          .replace(match[0], '');
      }

      if (statusCode != 200) {
        return res.send(statusCode, req.prerender.content);
      }
    }

    next();
  },
};
