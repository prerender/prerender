prerender = require('./lib/prerender');

// prerender.use(require('./lib/plugins/whitelist'));
// prerender.use(require('./lib/plugins/logger'));
// prerender.use(require('./lib/plugins/html-caching'));
prerender.use(require('./lib/plugins/remove-script-tags'));
prerender.use(require('./lib/plugins/http-headers'));

prerender.createServer();
