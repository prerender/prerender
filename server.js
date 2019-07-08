#!/usr/bin/env node
var prerender = require('./lib');

var server = prerender({
  chromeLocation: process.env.CHROME_BINARY,
  chromeFlags: process.env.CHROME_FLAGS ? process.env.CHROME_FLAGS.split(',') : ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars'],
});

server.use(prerender.sendPrerenderHeader());
// server.use(prerender.blockResources());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());


server.start();
