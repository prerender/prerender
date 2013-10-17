var url = require("url");

var ALLOWED_DOMAINS = [];

module.exports = {
    beforePhantomRequest: function(req, res, next) {
        var parsed = url.parse(req.prerender.url);

        if(ALLOWED_DOMAINS.indexOf(parsed.hostname) > -1) {
            next();
        } else {
            res.send(404, "");
        }
    }
}