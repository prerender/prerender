// Trigger a 404 header if the body or console log matches the following strings
var soft404Config = {
    matchBody: "<p>404</p>",
    matchConsole: "did match any routes in your application"
};

module.exports = {
    onPhantomPageCreate: function(req, res, next) {
        var _this = this;

        this.pageNotFound = false;

        req.prerender.page.set('onConsoleMessage', function(msg) {
            if (msg.indexOf(soft404Config.matchConsole) > -1) {
                _this.pageNotFound = true;
            }
        });

        next();
    },

    afterPhantomRequest: function(req, res, next) {
        if (req.prerender.documentHTML.indexOf(soft404Config.matchBody) > -1) {
            this.pageNotFound = true;
        }

        if (this.pageNotFound) {
            res.send(404, req.prerender.documentHTML);
        } else {
            next();
        }
    }
}
