// TODO VCs TESTED
module.exports = {
	name: 'sendPrerenderHeader',
	tabCreated: (req, _res, next) => {

		req.prerender.tab.setExtraHTTPHeaders({
			'X-Prerender': '1'
		});

		next();
	}
}