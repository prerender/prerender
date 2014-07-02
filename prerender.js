#!/usr/bin/env node
var prerender = require('./lib');
var config = require('config');

var server = prerender({
    workers: config.phantom_cluster_num_workers,
    iterations: config.phantom_worker_iterations || 10,
    phantomBasePort: config.phantom_cluster_base_port || 12300,
    messageTimeout: config.phantom_cluster_message_timeout
});


// server.use(prerender.basicAuth());
// server.use(prerender.whitelist());
server.use(prerender.blacklist());
server.use(prerender.logger());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
server.use(prerender.s3HtmlCache());

if (config.logger.aws) {
  server.use(prerender.snsNotify());
}

server.start();
