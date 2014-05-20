module.exports = {
    init: function() {
    
    },
	onPhantomPageCreate: function (phantom ,req, res, next){
		var page = req.prerender.page;
		page.set('onCallback', function() {
			req.prerender.htmlReady = true;
			});
		page.set('onInitialized', function() {
			var page = req.prerender.page;
		    page.evaluate(function() {
		         document.addEventListener('__htmlReady__', function() {
		             window.callPhantom();
		         }, false);
		     });
		 });
		 next();
	}
}
