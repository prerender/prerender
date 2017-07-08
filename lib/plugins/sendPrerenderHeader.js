module.exports = {
	tabCreated: (req, res, next) => {

		req.prerender.chrome.Network.setExtraHTTPHeaders({
			headers: {
				'X-Prerender': '1'
			}
		});

		next();
	}
}