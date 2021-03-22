module.exports = {
	tabCreated: async (req, res, next) => {

		await req.prerender.tab.setExtraHTTPHeaders({
			'X-Prerender': '1'
		});

		next();
	}
}