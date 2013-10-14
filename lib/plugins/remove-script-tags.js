module.exports = {
    afterPhantomRequest: function(req, res, next) {
        var matches = req.prerender.documentHTML.match(/<script(?:.*?)>(?:[\S\s]*?)<\/script>/gi);
        for (var i = 0; matches && i < matches.length; i++) {
            req.prerender.documentHTML = req.prerender.documentHTML.replace(matches[i], '');
        }

        next();
    }
};