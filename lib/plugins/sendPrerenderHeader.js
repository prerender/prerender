module.exports = {
    onPhantomPageCreate: function(phantom, req, res, next) {

        req.prerender.page.run(function(resolve) {

            var customHeaders = this.customHeaders;

            customHeaders['X-Prerender'] = 1;

            this.customHeaders = customHeaders;

            resolve();

        }).then(function() {

            next();
        }).catch(function() {

            next();
        });
    }
}