module.exports = {
	pageLoaded: (req, res, next) => {
		if (!req.prerender.content || req.prerender.renderType != 'html') {
			return next();
		}

		var matches = req.prerender.content.toString().match(/<script(?:.*?)>(?:[\S\s]*?)<\/script>/gi);
		for (let i = 0; matches && i < matches.length; i++) {
			if (matches[i].indexOf('application/ld+json') === -1) {
				req.prerender.content = req.prerender.content.toString().replace(matches[i], '');
			}
		}

		next();
	}
};