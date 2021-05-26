module.exports = {
	pageLoaded: (req, res, next) => {
		// Prepend HTML output with a HTML comment. Only run when not cached.
		if (req.prerender.content && req.prerender.statusCode === 200 && req.prerender.renderType === 'html') {
			const date = (new Date()).toString();
			const content = `<!--Prerendered ${date}-->\r\n${req.prerender.content}`;
			res.send(200, content)
		}
    		else {
			next();
    		}
	}
}
