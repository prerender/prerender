var phantom = require('phantom')
, http = require('http')
,cache_manager = require('cache-manager');

var memCache = cache_manager.caching(
    {store: 'memory', max: 100, ttl: 60/*seconds*/}
);

phantom.create(function(phantom) {
    http.createServer(function (req, res) {
        console.log('getting', req.url);
	memCache.get(req.url.substr(1), function(err, result){
	    if (!err && result != null) {
		res.writeHead(200, {'Content-Type': 'text/html'});
		res.end(result);
	    } else {	
		phantom.createPage(function(page) {
		    page.open(req.url.substr(1), function (status) {
			if ('fail' === status) { 
			    res.writeHead(404);
			    res.end();
			    page.close();
			} else {
			    setTimeout(function(){
				page.evaluate(function () {
				    return document && document.getElementsByTagName('html')[0].outerHTML
				}, function(documentHTML) {
				    var matches = documentHTML.match(/<script(?:.*?)>(?:[\S\s]*?)<\/script>/g);

				    for( var i = 0; matches && i < matches.length; i++) {
					documentHTML = documentHTML.replace(matches[i], '');
				    }
				    memCache.set(req.url.substr(1), documentHTML);
				    res.writeHead(200, {'Content-Type': 'text/html'});
				    res.end(documentHTML);
				    page.close();
				});
			    }, 50);
			};
		    });
                });
            };
        });
    }).listen(process.env.PORT || 3000);
    console.log('Server running on port ' + (process.env.PORT || 3000));
});