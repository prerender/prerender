prerender = require('./lib/prerender');

prerender.use(require('./lib/plugins/whitelist'));
prerender.use(require('./lib/plugins/html-caching'));
prerender.use(require('./lib/plugins/remove-script-tags'));

prerender.createServer();