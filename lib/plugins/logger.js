module.exports = {
    onPhantomPageCreate: function(phantom, req, res, next) {
        phantom.set('onConsoleMessage', function(msg) {
            console.log(msg);
        });

        next();
    }
}
