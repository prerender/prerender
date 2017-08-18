const util = require('./util.js');
const zlib = require('zlib');
const validUrl = require('valid-url');

const WAIT_AFTER_LAST_REQUEST = process.env.WAIT_AFTER_LAST_REQUEST || 500;

const PAGE_DONE_CHECK_INTERVAL = process.env.PAGE_DONE_CHECK_INTERVAL || 500;

const PAGE_LOAD_TIMEOUT = process.env.PAGE_LOAD_TIMEOUT || 20 * 1000;

const FOLLOW_REDIRECT = process.env.FOLLOW_REDIRECT || false;

const LOG_REQUESTS = process.env.LOG_REQUESTS || false;

const server = exports = module.exports = {};



server.init = function(options) {
	this.plugins = this.plugins || [];
	this.options = options || {};

	this.options.waitAfterLastRequest = this.options.waitAfterLastRequest || WAIT_AFTER_LAST_REQUEST;
	this.options.pageDoneCheckInterval = this.options.pageDoneCheckInterval || PAGE_DONE_CHECK_INTERVAL;
	this.options.pageLoadTimeout = this.options.pageLoadTimeout || PAGE_LOAD_TIMEOUT;
	this.options.followRedirect = this.options.followRedirect || FOLLOW_REDIRECT;
	this.options.logRequests = this.options.logRequests || LOG_REQUESTS;

	this.browser = require('./browsers/chrome');

	return this;
};



server.start = function() {
	util.log('Starting Prerender');
	this.startPrerender().then(() => {

		process.on('SIGINT', () => {
			this.killBrowser();
			setTimeout(() => {
				util.log('Stopping Prerender');
				process.exit();
			}, 500);
		});

	}).catch(() => {
		if(process.exit) {
			process.exit();
		}
	});
};



server.startPrerender = function() {
	return new Promise((resolve, reject) => {
		this.spawnBrowser().then(() => {

			this.listenForBrowserClose();
			return this.connectToBrowser();
		}).then(() => {
			util.log(`Started ${this.browser.name}: ${this.browser.version}`)
			resolve();
		}).catch((err) => {
			console.log(err);
			util.log(`Failed to start and/or connect to ${this.browser.name}. Please make sure ${this.browser.name} is running`);
			this.killBrowser();
			reject();
		});
	});
};



server.spawnBrowser = function() {

	util.log(`Starting ${this.browser.name}`);
	return this.browser.spawn(this.options);
};



server.killBrowser = function() {
	util.log(`Stopping ${this.browser.name}`);
	this.isBrowserClosing = true;
	this.browser.kill();
};



server.connectToBrowser = function() {
	return this.browser.connect();
};



server.listenForBrowserClose = function() {
	let start = new Date().getTime();

	this.isBrowserClosing = false;

	this.browser.onClose(() => {
		if(this.isBrowserClosing) {
			util.log(`Stopped ${this.browser.name}`);
			return;
		}

		util.log(`${this.browser.name} connection closed... restarting ${this.browser.name}`);

		if (new Date().getTime() - start < 1000) {
			util.log(`${this.browser.name} died immediately after restart... stopping Prerender`);
			return process.exit();
		}

		this.startPrerender();
	});
};



server.use = function(plugin) {
	this.plugins.push(plugin);
	if (typeof plugin.init === 'function') plugin.init(this);
};



server.onRequest = function(req, res) {

	req.prerender = {
		url: util.getUrl(req),
		start: new Date()
	};

	util.log('getting', req.prerender.url);

	this.firePluginEvent('requestReceived', req, res)
	.then(() => {

		if(!validUrl.isWebUri(encodeURI(req.prerender.url))) {
			util.log('invalid URL:', req.prerender.url);
			req.prerender.statusCode = 504;
			return Promise.reject();
		}

		return this.browser.openTab(req.prerender);

	}).then((tab) => {
		req.prerender.tab = tab;

		return this.firePluginEvent('tabCreated', req, res);
	}).then(() => {

		return this.browser.loadUrlThenWaitForPageLoadEvent(req.prerender.tab, req.prerender.url);
	}).then(() => {

		//if we get a non-200 status code, return what was sent back with the status text.
		if (req.prerender.tab.prerender.statusCode != 200) {
			return Promise.resolve();
		}

		return this.browser.parseHtmlFromPage(req.prerender.tab);
	}).then(() => {

		req.prerender.statusCode = req.prerender.tab.prerender.statusCode;
		req.prerender.documentHTML = req.prerender.tab.prerender.documentHTML;
		req.prerender.headers = req.prerender.tab.prerender.headers;

		return this.firePluginEvent('pageLoaded', req, res);
	}).then(() => {
		this.finish(req, res);
	}).catch((err) => {
		if(err) console.log(err);
		this.finish(req, res);
	});
};



server.finish = function(req, res) {
	if(req.prerender.tab) {
		this.browser.closeTab(req.prerender.tab).catch((err) => {
			util.log('error closing Chrome tab', err);
		});
	}

	this.firePluginEvent('beforeSend', req, res)
		.then(() => {
			this._send(req, res);
		}).catch(() => {
			this._send(req, res);
		});
};



server.firePluginEvent = function(methodName, req, res) {
	return new Promise((resolve, reject) => {
		let index = 0;
		let done = false;
		let next = null;
		var args = [req, res];

		res.send = function(statusCode, html) {
			if (statusCode) req.prerender.statusCode = statusCode;
			if (html) req.prerender.documentHTML = html;
			done = true;
			reject();
		};

		next = () => {
			if (done) return;

			let layer = this.plugins[index++];
			if (!layer) {
				return resolve();
			}

			let method = layer[methodName];

			if (method) {
				try {
					method.apply(layer, args);
				} catch (e) {
					console.log(e);
					next();
				}
			} else {
				next();
			}
		};

		args.push(next);
		next();
	});
};



server._send = function(req, res) {

	req.prerender.statusCode = parseInt(req.prerender.statusCode) || 504;

	Object.keys(req.prerender.headers || {}).forEach(function(header) {
		try {
			res.setHeader(header, req.prerender.headers[header]);
		} catch (e) {
			util.log('warning: unable to set header:', header);
		}
	});

	res.setHeader('Content-Type', 'text/html;charset=UTF-8');

	if (req.headers['accept-encoding'] && req.headers['accept-encoding'].indexOf('gzip') >= 0) {

		res.setHeader('Content-Encoding', 'gzip');
		zlib.gzip(req.prerender.documentHTML, (err, result) => {
			req.prerender.documentHTML = result;
			this._sendResponse(req, res);
		});

	} else {

		res.removeHeader('Content-Encoding');
		this._sendResponse(req, res);
	}
};



server._sendResponse = function(req, res) {

	if (req.prerender.documentHTML) {
		if (Buffer.isBuffer(req.prerender.documentHTML)) {
			res.setHeader('Content-Length', req.prerender.documentHTML.length);
		} else {
			res.setHeader('Content-Length', Buffer.byteLength(req.prerender.documentHTML, 'utf8'));
		}
	}

	if (!req.prerender.documentHTML) {
		res.removeHeader('Content-Length');
	}

	//if the original server had a chunked encoding, we should remove it since we aren't sending a chunked response
	res.removeHeader('Transfer-Encoding');
	//if the original server wanted to keep the connection alive, let's close it
	res.removeHeader('Connection');
	//getting 502s for sites that return these headers
	res.removeHeader('X-Content-Security-Policy');
	res.removeHeader('Content-Security-Policy');

	res.writeHead(req.prerender.statusCode);

	if (req.prerender.documentHTML) res.write(req.prerender.documentHTML);

	res.end();

	var ms = new Date().getTime() - req.prerender.start.getTime();
	util.log('got', req.prerender.statusCode, 'in', ms + 'ms', 'for', req.prerender.url);
};