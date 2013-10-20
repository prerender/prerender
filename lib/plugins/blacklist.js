var url = require("url");

module.exports = {
	init: function() {
		this.BLACKLISTED_DOMAINS = (process.env.BLACKLISTED_DOMAINS && process.env.BLACKLISTED_DOMAINS.split(',')) || [];
	},
    beforePhantomRequest: function(req, res, next) {
        var parsed = url.parse(req.prerender.url);

        if(this.BLACKLISTED_DOMAINS.indexOf(parsed.hostname) > -1) {
            res.send(404);
        } else {
            next();
        }
    }
}