const fs = require('fs');
const path = require('path');
const http = require('http');
const util = require('./util');
const basename = path.basename;
const server = require('./server');

exports = module.exports = (options = {}) => {
	const port = options.port || process.env.PORT || 3000;
	const hostname = options.hostname || process.env.NODE_HOSTNAME || undefined;

	server.init(options);

	const httpServer = http.createServer(server.onRequest.bind(server));

	httpServer.on('error', (err) => {
		util.log(err);
		server.killChrome();
		setTimeout(() => {
			util.log('Stopping Prerender');
			process.exit();
		}, 500);
	});

	httpServer.listen(port, hostname, () => {
		util.log('Prerender server accepting requests on port ' + port);
	});

	return server;
};

fs.readdirSync(__dirname + '/plugins').forEach((filename) => {
	if (!/\.js$/.test(filename)) return;

	var name = basename(filename, '.js');

	function load() {
		return require('./plugins/' + name);
	};

	Object.defineProperty(exports, name, {
		value: load
	});
});