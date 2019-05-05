var url = require('url');

var userCacheConfig = {
  whitelistedDomains: (process.env.WHITELISTED_DOMAINS && process.env.WHITELISTED_DOMAINS.split(',')) || [],
  blacklistedStrings: (process.env.BLACKLISTED_STRINGS && process.env.BLACKLISTED_STRINGS.split(',')) || ['.svg', '.jpg', '.jpeg', '.png', '.gif', '.css']
};

module.exports = {
  
  tabCreated: (req, res, next) => {

    let host = url.parse(req.prerender.url).host

    req.prerender.tab.Network.setRequestInterception({
      patterns: [{urlPattern: '*'}]
    }).finally(() => {
      next();
    })

    req.prerender.tab.Network.requestIntercepted(({interceptionId, request}) => {

      let interceptOptions = {interceptionId}
      let thisRequestHost = url.parse(request.url).host
      let shouldBlock = thisRequestHost != host;

      for (let whitelistedDomain of userCacheConfig.whitelistedDomains) {
        if (thisRequestHost === whitelistedDomain) shouldBlock = false
      }

      for (let blockedString of userCacheConfig.blacklistedStrings) {
        if (request.url.indexOf(blockedString) >= 0) shouldBlock = true
      }

      if (shouldBlock) {
        interceptOptions.errorReason = 'Aborted';
        req.prerender.tab.Network.continueInterceptedRequest(interceptOptions);

      } else {

        req.prerender.tab.Network.continueInterceptedRequest(interceptOptions);
      }

    });

  }
};