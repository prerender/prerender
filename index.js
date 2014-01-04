prerender = require('./lib')({
    workers: process.env.PHANTOM_CLUSTER_NUM_WORKERS,
    iterations: process.env.PHANTOM_WORKER_ITERATIONS || 10,
    phantomArguments: ["--load-images=false"],
    phantomBasePort: process.env.PHANTOM_CLUSTER_BASE_PORT,
    messageTimeout: process.env.PHANTOM_CLUSTER_MESSAGE_TIMEOUT
});

// prerender.use(require('./lib/plugins/whitelist'));
prerender.use(require('./lib/plugins/blacklist'));
// prerender.use(require('./lib/plugins/logger'));
prerender.use(require('./lib/plugins/remove-script-tags'));
// prerender.use(require('./lib/plugins/in-memory-html-cache'));
// prerender.use(require('./lib/plugins/s3-html-cache'));
prerender.use(require('./lib/plugins/http-headers'));

prerender.start();
