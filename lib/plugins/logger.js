module.exports = {
    onPhantomPageCreate: function(phantom, req, res, next) {
        req.prerender.page.run(function() {

        	this.onConsoleMessage = function(msg) {
	            console.log(msg);
	        };
        });

        next();
    }
}
