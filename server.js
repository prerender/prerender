#!/usr/bin/env node
var prerender = require('./lib');

var server = prerender({
    workers: process.env.PHANTOM_CLUSTER_NUM_WORKERS,
    iterations: process.env.PHANTOM_WORKER_ITERATIONS || 10,
    phantomBasePort: process.env.PHANTOM_CLUSTER_BASE_PORT || 12300,
    messageTimeout: process.env.PHANTOM_CLUSTER_MESSAGE_TIMEOUT
});

// basicAuth whitelist blacklist logger removeScriptTags httpHeaders inMemoryHtmlCache s3HtmlCache
var plugins = process.env.PRERENDER_PLUGINS || 'blacklist,removeScriptTags,httpHeaders';
console.log('Plugins:', plugins);

plugins.split(/[, ]+/).forEach(function(plugin) {
  if (plugin && prerender[plugin]) {
    server.use(prerender[plugin]());
  }
});

server.start();
