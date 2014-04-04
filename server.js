var prerender = require('prerender')

var server = prerender({
    workers: process.env.PHANTOM_CLUSTER_NUM_WORKERS,
    phantomArguments: ["--load-images=false", "--ignore-ssl-errors=true"],
    followRedirect: true
});

server.use(prerender.basicAuth());
server.use(require('./lib/plugins/override-default-user-agent'));

server.start();
