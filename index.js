prerender = require('./lib/prerender');

// prerender.use(require('./lib/plugins/whitelist'));
prerender.use(require('./lib/plugins/blacklist'));
// prerender.use(require('./lib/plugins/logger'));
prerender.use(require('./lib/plugins/remove-script-tags'));
// prerender.use(require('./lib/plugins/in-memory-html-cache'));
prerender.use(require('./lib/plugins/s3-html-cache'));
prerender.use(require('./lib/plugins/http-headers'));

prerender.createServer();
