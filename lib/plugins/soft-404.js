module.exports = {
    afterPhantomRequest: function(req, res, next) {
        if (req.prerender.documentHTML.indexOf('<!-- Status: 404 Not Found -->') > -1) {
            res.send(404, req.prerender.documentHTML);
        } else {
            next();
        }
    }
}
