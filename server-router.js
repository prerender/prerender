#!/usr/bin/env node
const express = require('express');
const compression = require('compression');
const router = express.Router({mergeParams: true});
const prerender = require('./lib');

// setup express server
const port = process.env.PORT || 3000;
const app = express();

app.disable('x-powered-by');
app.use(compression());
app.listen(port, () => console.log(`server accepting requests on port ${port}`));

// start prerender server on /prerender nested path
const server = prerender({}, router);
app.use('/prerender', router);

server.use(prerender.sendPrerenderHeader());
server.use(prerender.removeScriptTags());
server.use(prerender.httpHeaders());
server.start();
