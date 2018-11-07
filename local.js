const fs = require('fs');
const path = require('path');
const basename = path.basename;
const server = require('./lib/server');

/**
 * Render an URL
 * 
 * Render an URL nad store into a file
 */
exports = module.exports = function (options = {}) {
	// Create request
	var request = new Request(options);
	var response = new Response(options);

	// render page
	server.init(options);
	options.plugins.forEach((plugin) => {
		if (!/\.js$/.test(plugin)) {
			return;
		}
		var name = basename(plugin, '.js');
		var module = require('./lib/plugins/' + name);
		server.use(module);
	});
	server.start();
	server.onRequest(request, response);
};


/**
 * Create a request
 * 
 */
function Request(options = {}) {
	if (!options.url) {
		throw 'URL must be defined.';
	}
	this.url = options.url;
	this.local = options;
}

function Response(options = {}) {
	this.header = {};
	this.options = options;
}
Response.prototype.setHeader = function (key, value) {
	this.header[key] = value;
};
Response.prototype.removeHeader = function (key) {
	// TODO:
};
Response.prototype.status = function (status) {
	this.setHeader('status', status);
};
Response.prototype.end = function () {
	// TODO: result is ready save 
};
Response.prototype.send = function (content) {
	this.content = content;
	switch (this.options.output.type) {
		case 'file':
			this.saveContentToFile();
			break;
		// case 'console':
		default:
			console.log(this.content);
	}
	server.killBrowser();
};
Response.prototype.saveContentToFile = function () {
	return fs.writeFile(this.options.output.path, this.content);
};