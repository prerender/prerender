
module.exports = {
	init: function() {
		this.SERVER_BASE_PATH = process.env.SERVER_BASE_PATH;
	},
    beforePhantomRequest: function(req, res, next) {

        if (this.SERVER_BASE_PATH){
        // Check the base path in the request url
            if(req.prerender.url.indexOf(this.SERVER_BASE_PATH) == 0){
                //Remove the base path from request url
                req.prerender.url = req.prerender.url.substr(this.SERVER_BASE_PATH.length);
                console.log("NEW URL ->" + req.prerender.url);
            } else {
                res.send(404);
                return;
            }
        }

        next();
    }
}