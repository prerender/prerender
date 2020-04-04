#!/usr/bin/env node
var prerender = require('./lib');
const PORT = process.env.PORT || 3000

var server = prerender({
  port: PORT
});

server.use(prerender.sendPrerenderHeader());
// server.use(prerender.blockResources());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());

server.start();
