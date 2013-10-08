var Phantom = require('phantom')
  , http = require('http');

Phantom.create({
    binary: require('phantomjs').path
}, function(phantom) {

    http.createServer(function (req, res) {
        console.log('getting', req.url);

        //hack to restart phantom if it crashes...for now
        var timeoutID = setTimeout(function() {
            console.log('restarting phantom due to timeout');
            Phantom.create(function(ph){
                phantom = ph;
                phantom.createPage(onPageCreate);
            });
        }, 5000);

        var onPageCreate = function(page) {
            clearTimeout(timeoutID); //wont get hit if phantom has crashed

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
                            res.writeHead(200, {'Content-Type': 'text/html'});
                            res.end(documentHTML);
                            page.close();
                        });
                    }, 50);
                };
            });
        };

        phantom.createPage(onPageCreate);

    }).listen(process.env.PORT || 3000);
    console.log('Server running on port ' + (process.env.PORT || 3000));
});