var phantom = require('phantom'),
    http = require('http'),
    cache_manager = require('cache-manager'),
    cache = {
        get: function (url, cb) {
            cb(null, null);
        },
        set: function (url, result) {
        }
    };

if (process.argv[2] != null && (process.argv[2] == '-c' || process.argv[2] == '--cache')) {
    console.log('Prerender started with caching turned ON');
    cache = cache_manager.caching({
        store: 'memory', max: 100, ttl: 60/*seconds*/
    });
}

phantom.create({
    binary: require('phantomjs').path
}, function (phantom) {
    http.createServer(function (req, res) {
        var url = req.url.substr(1);
        console.log('getting', url);
        cache.get(req.url.substr(1), function (err, result) {
            if (!err && result) {
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(result);
            } else {
                var start = new Date();
                phantom.createPage(function (page) {
                    page.open(url, function (status) {
                        if ('fail' === status) {
                            res.writeHead(404);
                            res.end();
                            page.close();
                        } else {
                            setTimeout(function () {
                                page.evaluate(function () {
                                    return document && document.getElementsByTagName('html')[0].outerHTML
                                }, function (documentHTML) {
                                    if (!documentHTML) {
                                        res.writeHead(404);
                                        res.end();
                                    } else {
                                        var matches = documentHTML.match(/<script(?:.*?)>(?:[\S\s]*?)<\/script>/g);
                                        for (var i = 0; matches && i < matches.length; i++) {
                                            documentHTML = documentHTML.replace(matches[i], '');
                                        }
                                        cache.set(url, documentHTML);
                                        res.writeHead(200, {'Content-Type': 'text/html'});
                                        res.end(documentHTML);
                                        console.log('got', url, 'in', new Date().getTime() - start.getTime() + 'ms')
                                    }
                                    page.close();
                                });
                            }, 50);
                        }
                        ;
                    });
                });
            }
        });
    }).listen(process.env.PORT || 3000);
    console.log('Server running on port ' + (process.env.PORT || 3000));
});