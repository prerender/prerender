module.exports = {
	tabCreated: function(req, res, next) {

		req.prerender.chrome.Network.setExtraHTTPHeaders({
			headers: {
				'X-Prerender': '1'
			}
		});

		next();
	}
}