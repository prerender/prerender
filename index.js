var phantom = require('phantom')
  , http = require('http');

phantom.create(function(phantom) {
    http.createServer(function (req, res) {
        if(req.url == '/favicon.ico' || req.url == '/') return;
        console.log('getting', req.url);
        phantom.createPage(function(page) {
            page.open(req.url.substr(1), function (status) {
                if ('fail' === status) { 
                    res.writeHead(404);
                    res.end();
                } else {
                    setTimeout(function(){
                        page.evaluate(function () {
                            return document && document.getElementsByTagName('html')[0].innerHTML
                        }, function(documentHTML) {
                            var matches = documentHTML.match(/<script(?:.*?)>(?:.*?)<\/script>/g);

                            for( var i = 0; i < matches.length; i++) {
                                documentHTML = documentHTML.replace(matches[i], '');
                            }
                            res.writeHead(200, {'Content-Type': 'text/html'});
                            res.end(documentHTML);
                        });
                    }, 50);
                };
            });
        });
    }).listen(process.env.PORT || 3000);
    console.log('Server running on port ' + (process.env.PORT || 3000));
});