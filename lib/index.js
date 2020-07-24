const fs = require('fs');
const path = require('path');
const util = require('./util');
const server = require('./server');

const basename = path.basename;

exports = module.exports = (options = {}) => {
	server.init(options);

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
