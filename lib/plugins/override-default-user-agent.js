
module.exports = {
    init: function(prerender) {
        //If you end up using a database, you can pass it in through this function from server.js
        // this.client = prerender.client;
    },

    /*
     * This method is called before we open the phantomjs page
     */
    onPhantomPageCreate: function(phantom, req, res, next) {

        this.getUserAgent(req, function(userAgent) {
            if(!userAgent) return next();

            // Append to the normal user agent
            req.prerender.page.get('settings.userAgent', function(phantomUserAgent) {
                req.prerender.page.set('settings.userAgent', phantomUserAgent + ' ' + userAgent);

                next();
            });
        });
    },

    /*
     * Change this URL to get the user agent from somewhere else
     * You could pull it in from a file
     * Or access a database to get a user agent based on the host or req.prerender.url
     */
    getUserAgent: function(req, callback) {

        if(req.headers['x-user-agent']) {

            process.nextTick(function() {
                callback(req.headers['x-user-agent']);
            });
        } else {
            callback(null);
        }
    }
}