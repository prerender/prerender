module.exports = {
    onPhantomPageCreate: function(phantom, context, next) {
        phantom.set('onConsoleMessage', function(msg) {
            console.log(msg);
        });

        next();
    }
}
