
module.exports = {
	tabCreated: async (req, res, next) => {
		if (req.prerender.product !== 'firefox') {
			await req.prerender.tab.setExtraHTTPHeaders({
				'X-Prerender': '1'
			});
	}

		next();
	}
}