#!/usr/bin/env node
var prerender = require('./lib');

var server = prerender();

// server.use(prerender.dynamicRendering());
server.use(prerender.serverSideRendering());

server.start();
