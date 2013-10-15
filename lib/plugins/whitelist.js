var url = require("url");

module.exports = {
    beforePhantomRequest: function(req, res, next) {
        var parsed = url.parse(req.prerender.url);

        if(parsed.hostname != 'themuse.com' && parsed.hostname != 'www.themuse.com') {
            res.send(404, "");
        } else {
            next();
        }
    }
}