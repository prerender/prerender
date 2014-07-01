module.exports = {
    beforeSend: function(req, res, next) {
      	if(!req.prerender.documentHTML) {
      		  return next();
      	}

        var matches = req.prerender.documentHTML.toString().match(/<script(?:.*?)>(?:[\S\s]*?)<\/script>/gi);
        for (var i = 0; matches && i < matches.length; i++) {
            if(matches[i].indexOf('application/ld+json') === -1) {
                req.prerender.documentHTML = req.prerender.documentHTML.toString().replace(matches[i], '');
            }
        }

        next();
    }
};
