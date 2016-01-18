#!/usr/bin/env node
var prerender = require('./lib');

var options = {
    workers: process.env.PHANTOM_CLUSTER_NUM_WORKERS,
    iterations: process.env.PHANTOM_WORKER_ITERATIONS || 10,
    phantomBasePort: process.env.PHANTOM_CLUSTER_BASE_PORT || 12300,
    messageTimeout: process.env.PHANTOM_CLUSTER_MESSAGE_TIMEOUT,
    phantomArguments: process.env.PHANTOM_ARGUMENTS ? JSON.parse(process.env.PHANTOM_ARGUMENTS) : process.env.PHANTOM_ARGUMENTS
};

var phantomStdout = process.env.PHANTOM_STDOUT;

if (phantomStdout === 'mute') {
  options.onStdout = function() {};
} else if (phantomStdout === 'quiet') {
  options.onStdout = function(data) {
    if (data && data.indexOf !== undefined && data.indexOf('Error:') > -1) {
      return console.log('phantom stdout: ' + data);
    }
  };
}

var server = prerender(options);

// basicAuth whitelist blacklist logger removeScriptTags httpHeaders inMemoryHtmlCache s3HtmlCache
var plugins = process.env.PRERENDER_PLUGINS || 'blacklist,removeScriptTags,httpHeaders';
console.log('Plugins:', plugins);

plugins.split(/[, ]+/).forEach(function(plugin) {
  if (plugin && prerender[plugin]) {
    server.use(prerender[plugin]());
  }
});

server.start();
