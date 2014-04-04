var prerender = require('prerender')

var server = prerender({
    workers: process.env.PHANTOM_CLUSTER_NUM_WORKERS,
    phantomArguments: [
    	"--load-images=false",
    	"--ignore-ssl-errors=true",
        "--ssl-protocol=tlsv1",
    	"--disk-cache=true",
    	"--max-disk-cache-size=1048576"
    ],
    followRedirect: true,
    waitAfterLastRequest: 2000
});

server.use(prerender.basicAuth());
server.use(require('./lib/plugins/override-default-user-agent'));
server.use(prerender.removeScriptTags());

server.start();
