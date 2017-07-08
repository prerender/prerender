const url = require("url");

module.exports = {
	init: () => {
		this.BLACKLISTED_DOMAINS = (process.env.BLACKLISTED_DOMAINS && process.env.BLACKLISTED_DOMAINS.split(',')) || [];
	},

	requestReceived: (req, res, next) => {
		let parsed = url.parse(req.prerender.url);

		if (this.BLACKLISTED_DOMAINS.indexOf(parsed.hostname) > -1) {
			res.send(404);
		} else {
			next();
		}
	}
}