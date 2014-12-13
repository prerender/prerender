module.exports = {
    onPhantomPageCreate: function(phantom, req, res, next) {
        req.prerender.page.set('onConsoleMessage', function(msg) {
            console.log(msg);
        });

        next();
    }
}
