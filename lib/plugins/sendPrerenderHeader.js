module.exports = {
	name: 'sendPrerenderHeader',
	tabCreated: async (req, _res, next) => {

		await req.prerender.tab.setExtraHTTPHeaders({
			'X-Prerender': '1'
		});

		next();
	}
}