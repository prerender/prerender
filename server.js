#!/usr/bin/env node
var prerender = require('./lib');

var server = prerender();

server.use(prerender.sendPrerenderHeader());
// server.use(prerender.blockResources());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());

if (
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.S3_BUCKET_NAME
) {
  server.use(require('prerender-aws-s3-cache'))
}

server.start();
