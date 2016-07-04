#!/usr/bin/env node
var crypto = require('crypto');

var prerender = require('./lib');

var server = prerender({
    workers: process.env.PRERENDER_NUM_WORKERS,
    iterations: process.env.PRERENDER_NUM_ITERATIONS
});


server.use(prerender.sendPrerenderHeader());
// server.use(prerender.basicAuth());
// server.use(prerender.whitelist());
server.use(prerender.blacklist());
// server.use(prerender.logger());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
// server.use(prerender.inMemoryHtmlCache());
// server.use(prerender.s3HtmlCache());

server.use(require('prerender-compressed-file-cache')({
    pathBuilder: function(key) {
        var path = process.env.CACHE_ROOT_DIR || '/tmp/prerender';
        var hash = crypto.createHash('sha1').update(key).digest('hex');
        path = path + '/' + hash;
        return path;
    },
    fileName: 'cache'
}));

server.start();
