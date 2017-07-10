const CDP = require('chrome-remote-interface');
const util = require('./util.js');
const zlib = require('zlib');
const validUrl = require('valid-url');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

const WAIT_AFTER_LAST_REQUEST = process.env.WAIT_AFTER_LAST_REQUEST || 500;

const PAGE_DONE_CHECK_INTERVAL = process.env.PAGE_DONE_CHECK_INTERVAL || 500;

const PAGE_LOAD_TIMEOUT = process.env.PAGE_LOAD_TIMEOUT || 20 * 1000;

const FOLLOW_REDIRECT = process.env.FOLLOW_REDIRECT || false;

const server = exports = module.exports = {};

server.init = function(options) {
	this.plugins = this.plugins || [];
	this.options = options || {};

	this.devToolsOptions = {
		host: options.chromeDevToolsHost,
		port: options.chromeDevToolsPort
	}

	return this;
};

server.start = function() {
	util.log('Starting Prerender');
	this.startPrerender().then(() => {

		process.on('SIGINT', () => {
			this.killChrome();
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
		this.spawnChrome().then(() => {

			return this.connectToChrome();
		}).then((info) => {
			this.originalUserAgent = info['User-Agent'];

			util.log(`Using ${info.Browser} with dev tools protocol version ${info['Protocol-Version']}`)
			util.log('Started Chrome')
			resolve();
		}).catch(() => {
			util.log('Failed to start and/or connect to Chrome. Please make sure Chrome is running');
			this.killChrome();
			reject();
		});
	});
};

server.spawnChrome = function() {
	return new Promise((resolve, reject) => {

		util.log('Starting Chrome');
		let start = new Date().getTime();
		let location = this.getChromeLocation();

		if (!fs.existsSync(location)) {
			util.log('unable to find Chrome install. Please specify with chromeLocation');
			return reject();
		}

		this.chromeChild = spawn(location, ['--headless', '--disable-gpu', '--remote-debugging-port=9222']);
		this.chromeClosing = false;

		this.chromeChild.on('close', () => {
			if(this.chromeClosing) {
				util.log('Stopped Chrome');
				return;
			}

			util.log('Chrome connection closed... restarting Chrome');

			if (new Date().getTime() - start < 1000) {
				util.log('Chrome died immediately after restart... killing Prerender');
				return process.exit();
			}

			server.startPrerender();
		});

		resolve();
	});
};

server.killChrome = function() {
	util.log('Stopping Chrome');
	this.chromeClosing = true;
	this.chromeChild.kill('SIGINT');
};

server.getChromeLocation = function() {
	if (this.options.chromeLocation) {
		return this.options.chromeLocation;
	}

	let platform = os.platform();

	if (platform === 'darwin') {
		return '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
	}

	if (platform === 'linux') {
		return '/usr/bin/google-chrome';
	}

	if (platform === 'win32') {
		return 'C:\Program Files (x86)\Google\Application\chrome.exe';
	}
};

server.connectToChrome = function() {
	return new Promise((resolve, reject) => {
		let connected = false;
		let timeout = setTimeout(() => {
			if (!connected) {
				reject();
			}
		}, 20 * 1000);

		let connect = () => {
			CDP.Version(Object.assign({}, this.devToolsOptions)).then((info) => {
				connected = true;
				clearTimeout(timeout);
				resolve(info);
			}).catch( (err) => {
				console.log('retrying connection to Chrome...');
				return setTimeout(connect, 1000);
			});
		};

		setTimeout(connect, 500);
	});
};

server.use = function(plugin) {
	this.plugins.push(plugin);
	if (typeof plugin.init === 'function') plugin.init(this);
};

server.onRequest = function(req, res) {

	req.prerender = {
		url: util.getUrl(req),
		start: new Date(),
		numRequestsInFlight: 0,
		requests: {}
	};

	util.log('getting', req.prerender.url);

	this.firePluginEvent('requestReceived', req, res)
		.then(() => {

			if(!validUrl.isWebUri(encodeURI(req.prerender.url))) {
				util.log('invalid URL:', req.prerender.url);
				req.prerender.statusCode = 504;
				return Promise.reject();
			}

			//create a new tab
			return CDP.New(Object.assign({}, this.devToolsOptions))
		}).then((tab) => {

			req.prerender.chromeTab = tab;

			//connect to the new tab
			return CDP(Object.assign({
				tab
			}, this.devToolsOptions));
		}).then((chrome) => {

			req.prerender.chrome = chrome;

			return this.setUpEvents(req, res);
		}).then(() => {

			return this.firePluginEvent('tabCreated', req, res);
		}).then(() => {

			return this.loadUrlThenWaitForPageLoadEvent(req, res);
		}).then(() => {

			//if we get a non-200 status code, return what was sent back with the status text.
			if (req.prerender.statusCode != 200) {
				return Promise.resolve();
			}

			return this.parseHtmlFromPage(req, res);
		}).then(() => {

			return this.firePluginEvent('pageLoaded', req, res);
		}).then(() => {
			this.finish(req, res);
		}).catch(() => {
			this.finish(req, res);
		});
};

server.setUpEvents = function(req, res) {
	return new Promise((resolve, reject) => {
		const {
			Page,
			DOM,
			IndexedDB,
			Network,
			Emulation,
			Log
		} = req.prerender.chrome;

		Promise.all([
			DOM.enable(),
			Page.enable(),
			IndexedDB.enable(),
			Network.enable(),
			Log.enable()
		]).then(() => {

			Emulation.setVisibleSize({
				width: 1440,
				height: 718
			}, (err, res) => {
				if (err) {
					console.log('Unable to setVisibleSize of page on this version of Chrome. Make sure you are up to date.')
				}
			});

			Network.setUserAgentOverride({
				userAgent: this.originalUserAgent + ' Prerender (+https://github.com/prerender/prerender)'
			});

			Network.requestWillBeSent((params) => {
				req.prerender.numRequestsInFlight++;
				req.prerender.requests[params.requestId] = params.request.url;
				if (this.options.logRequests) util.log('+', req.prerender.numRequestsInFlight, params.request.url);

				if (!req.prerender.initialRequestId) req.prerender.initialRequestId = params.loaderId;

				if (params.redirectResponse) {
					//during a redirect, we don't get the responseReceived event for the original request,
					//so lets decrement the number of requests in flight here.
					//the original requestId is also reused for the redirected request
					req.prerender.numRequestsInFlight--;

					if (params.redirectResponse.url === req.prerender.url && !this.shouldFollowRedirects(req)) {
						req.prerender.lastRequestReceivedAt = new Date().getTime();
						req.prerender.statusCode = params.redirectResponse.status;
						req.prerender.headers = params.redirectResponse.headers;
						req.prerender.documentHTML = params.redirectResponse.statusText;

						Page.stopLoading((err) => {
							if (err) {
								console.log('Unable to stopLoading of page after a redirect on this version of Chrome. Make sure you are up to date.')
							}
						});
					}
				}
			});

			Network.responseReceived((params) => {
				req.prerender.numRequestsInFlight--;
				req.prerender.lastRequestReceivedAt = new Date().getTime();
				if (this.options.logRequests) util.log('-', req.prerender.numRequestsInFlight, req.prerender.requests[params.requestId]);
				delete req.prerender.requests[params.requestId];

				if (params.requestId == req.prerender.initialRequestId) {
					req.prerender.statusCode = params.response.status;
					req.prerender.headers = params.response.headers;
				}
			});

			//when a redirect happens and we call Page.stopLoading,
			//all outstanding requests will fire this event
			Network.loadingFailed((params) => {
				//there is a case where loadingFailed can be called after responseReceived
				//for the same URL. We will check to see if we've already counted this resource first
				if(req.prerender.requests[params.requestId]) {
					req.prerender.numRequestsInFlight--;
					if (this.options.logRequests) util.log('-', req.prerender.numRequestsInFlight, req.prerender.requests[params.requestId]);
					delete req.prerender.requests[params.requestId];
				}
			});

			Log.entryAdded((params) => {
				if (this.options.logRequests) util.log(params.entry);
			});

			resolve();
		}).catch((err) => {
			reject(err);
		});
	});
};

server.loadUrlThenWaitForPageLoadEvent = function(req, res) {

	return new Promise((resolve, reject) => {

		var finished = false;
		const {
			Page,
			IndexedDB,
			Network
		} = req.prerender.chrome;

		Network.clearBrowserCache(() => {
			Network.clearBrowserCookies(() => {
				IndexedDB.clearObjectStore(() => {
					req.prerender.chrome.Runtime.evaluate({
						expression: 'window.localStorage.clear()'
					}, () => {
						let pageDoneCheckInterval = req.prerender.pageDoneCheckInterval || this.options.pageDoneCheckInterval || PAGE_DONE_CHECK_INTERVAL
						let pageLoadTimeout = req.prerender.pageLoadTimeout || this.options.pageLoadTimeout || PAGE_LOAD_TIMEOUT;

						var pageLoadInterval = setInterval(() => {
							this.checkIfPageIsDoneLoading(req).then((doneLoading) => {
								if (doneLoading && !finished) {
									finished = true;
									clearInterval(pageLoadInterval);
									resolve();
								}
							}).catch(() => {
								finished = true;
								clearInterval(pageLoadInterval);

								util.log('Chrome connection closed during request');
								req.prerender.statusCode = 504;
								reject();
							});
						}, pageDoneCheckInterval);

						setTimeout(() => {
							if (!finished) {
								finished = true;
								console.log('page timed out');
								clearInterval(pageLoadInterval);
								resolve();
							}
						}, pageLoadTimeout);

						Page.navigate({
							url: req.prerender.url
						}).catch(() => {
							util.log('invalid URL sent to Chrome:', req.prerender.url);
							req.prerender.statusCode = 504;
							finished = true;
							clearInterval(pageLoadInterval);
							reject();
						});
					});
				});
			});
		});
	});
};

server.parseHtmlFromPage = function(req, res) {
	return new Promise((resolve, reject) => {
		const {
			DOM
		} = req.prerender.chrome;

		DOM.getDocument(function(err, resp) {
			DOM.querySelector({
				nodeId: resp.root.nodeId,
				selector: 'html'
			}, (err, resp) => {
				DOM.getOuterHTML({
					nodeId: resp.nodeId
				}, function(err, resp) {

					req.prerender.chrome.Runtime.evaluate({
						expression: 'document.doctype'
					}, (err, response) => {
						let doctype = '';
						if (response && response.result && response.result.description) {
							doctype = response.result.description;
						}

						req.prerender.documentHTML = doctype + resp.outerHTML;
						resolve();
					});
				});
			});
		});
	});
};

server.finish = function(req, res) {
	if (req.prerender.chromeTab) {
		CDP.Close(Object.assign({
			id: req.prerender.chromeTab.id
		}, this.devToolsOptions)).catch(() => {
			util.log('error closing Chrome tab');
		});
	}

	if (req.prerender.chrome) {
		req.prerender.chrome.close();
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
			if (html) req.prerender.html = html;
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


server.shouldFollowRedirects = function(req) {
	return req.prerender.followRedirect || this.options.followRedirect || process.env.FOLLOW_REDIRECT;
};

server.checkIfPageIsDoneLoading = function(req) {
	return new Promise((resolve, reject) => {
		req.prerender.chrome.Runtime.evaluate({
			expression: 'window.prerenderReady'
		}, (err, result) => {
			let prerenderReady = result && result.result && result.result.value;
			let shouldWaitForPrerenderReady = typeof prerenderReady == 'boolean';
			let waitAfterLastRequest = req.prerender.waitAfterLastRequest || this.options.waitAfterLastRequest || WAIT_AFTER_LAST_REQUEST;

			let doneLoading = req.prerender.numRequestsInFlight <= 0 &&
				req.prerender.lastRequestReceivedAt < ((new Date()).getTime() - waitAfterLastRequest)

			resolve((!shouldWaitForPrerenderReady && doneLoading) || (shouldWaitForPrerenderReady && doneLoading && prerenderReady));
		});
	});

};