prerender = require('./lib/prerender');

// prerender.use(require('./lib/plugins/html-caching'));
prerender.use(require('./lib/plugins/remove-script-tags'));
// prerender.use(require('./lib/plugins/soft-404'));
// prerender.use(require('./lib/plugins/debugger'));

prerender.createServer();
