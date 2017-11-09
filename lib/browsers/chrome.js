const CDP = require('chrome-remote-interface');
const { spawn } = require('child_process');
const util = require('../util.js');
const fs = require('fs');
const os = require('os');

const chrome = exports = module.exports = {};

chrome.name = 'Chrome';



chrome.spawn = function(options) {
	return new Promise((resolve, reject) => {
		this.options = options;
		let location = this.getChromeLocation();

		if (!fs.existsSync(location)) {
			util.log('unable to find Chrome install. Please specify with chromeLocation');
			return reject();
		}

		this.chromeChild = spawn(location, this.options.chromeFlags || ['--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars']);

		resolve();
	});
};



chrome.onClose = function(callback) {
	this.chromeChild.on('close', callback);
};



chrome.kill = function() {
	this.chromeChild.kill('SIGINT');
};



chrome.connect = function() {
	return new Promise((resolve, reject) => {
		let connected = false;
		let timeout = setTimeout(() => {
			if (!connected) {
				reject();
			}
		}, 20 * 1000);

		let connect = () => {
			CDP.Version().then((info) => {

				this.originalUserAgent = info['User-Agent'];
				this.webSocketDebuggerURL = info.webSocketDebuggerUrl || 'ws://localhost:9222/devtools/browser';
				this.version = info.Browser;

				clearTimeout(timeout);
				connected = true;
				resolve();

			}).catch((err) => {
				util.log('retrying connection to Chrome...');
				return setTimeout(connect, 1000);
			});
		};

		setTimeout(connect, 500);

	});
};



chrome.getChromeLocation = function() {
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
		return 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
	}
};



chrome.openTab = function(options) {
	return new Promise((resolve, reject) => {

		let browserContext = null;
		let browser = null;

		CDP({ target: this.webSocketDebuggerURL })
		.then((chromeBrowser) => {
			browser = chromeBrowser;

			return browser.Target.createBrowserContext();
		}).then(({ browserContextId }) => {

			browserContext = browserContextId;

			return browser.Target.createTarget({
				url: 'about:blank',
				width: options.width || 1440,
				height: options.height || 718,
				browserContext
			});
		}).then(({ targetId }) => {

			return CDP({ target: targetId });
		}).then((tab) => {

			//we're going to put our state on the chrome tab for now
			//we should clean this up later
			tab.browserContextId = browserContext;
			tab.browser = browser;
			tab.prerender = options;
			tab.prerender.requests = {};
			tab.prerender.numRequestsInFlight = 0;

			return this.setUpEvents(tab);
		}).then((tab) => {

			resolve(tab);
		}).catch((err) => { reject(err) });
	});
};



chrome.closeTab = function(tab) {
	return new Promise((resolve, reject) => {

		tab.browser.Target.closeTarget({targetId: tab.target})
		.then(() => {

			return tab.browser.Target.disposeBrowserContext({ browserContextId: tab.browserContextId });
		}).then((resp) => {
			if(!resp.success) {
				return reject('unable to dispose of browser context');
			}

			return tab.browser.close();
		}).then(() => {

			resolve();
		}).catch((err) => {
			reject(err);
		});
	});
};



chrome.setUpEvents = function(tab) {
	return new Promise((resolve, reject) => {

		const {
			Page,
			Security,
			DOM,
			Network,
			Emulation,
			Log
		} = tab;

		Promise.all([
			DOM.enable(),
			Page.enable(),
			Security.enable(),
			Network.enable(),
			Log.enable()
		]).then(() => {

			Security.certificateError(({eventId}) => {
				Security.handleCertificateError({
					eventId,
					action: 'continue'
				}).catch((err) => {
					util.log('error handling certificate error:', err);
				});
			});

			Security.setOverrideCertificateErrors({override: true});

			Network.setUserAgentOverride({
				userAgent: tab.prerender.userAgent || this.options.userAgent || this.originalUserAgent + ' Prerender (+https://github.com/prerender/prerender)'
			});

			Network.setBypassServiceWorker({bypass: true})

			Network.requestWillBeSent((params) => {
				tab.prerender.numRequestsInFlight++;
				tab.prerender.requests[params.requestId] = params.request.url;
				if (tab.prerender.logRequests || this.options.logRequests) util.log('+', tab.prerender.numRequestsInFlight, params.request.url);

				if (!tab.prerender.initialRequestId) tab.prerender.initialRequestId = params.loaderId;

				if (params.redirectResponse) {
					//during a redirect, we don't get the responseReceived event for the original request,
					//so lets decrement the number of requests in flight here.
					//the original requestId is also reused for the redirected request
					tab.prerender.numRequestsInFlight--;

					if (params.redirectResponse.url === tab.prerender.url && !tab.prerender.followRedirects && !this.options.followRedirects) {
						tab.prerender.lastRequestReceivedAt = new Date().getTime();
						tab.prerender.statusCode = params.redirectResponse.status;
						tab.prerender.headers = params.redirectResponse.headers;
						tab.prerender.content = params.redirectResponse.statusText;

						Page.stopLoading();
					}
				}
			});

			Network.responseReceived((params) => {
				//there is a case where responseReceived can be called twice
				//for the same URL. We will check to see if we've already counted this resource first
				if(tab.prerender.requests[params.requestId]) {
					tab.prerender.numRequestsInFlight--;
					tab.prerender.lastRequestReceivedAt = new Date().getTime();

					if (tab.prerender.logRequests || this.options.logRequests) util.log('-', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
					delete tab.prerender.requests[params.requestId];

					if (params.requestId == tab.prerender.initialRequestId) {
						tab.prerender.statusCode = params.response.status;
						tab.prerender.headers = params.response.headers;

						//if we get a 304 from the server, turn it into a 200 on our end
						if(tab.prerender.statusCode == 304) tab.prerender.statusCode = 200;
					}
				}
			});

			//when a redirect happens and we call Page.stopLoading,
			//all outstanding requests will fire this event
			Network.loadingFailed((params) => {
				//there is a case where loadingFailed can be called after responseReceived
				//for the same URL. We will check to see if we've already counted this resource first
				if(tab.prerender.requests[params.requestId]) {
					tab.prerender.numRequestsInFlight--;
					if (tab.prerender.logRequests || this.options.logRequests) util.log('-', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
					delete tab.prerender.requests[params.requestId];
				}
			});

			Log.entryAdded((params) => {
				if (tab.prerender.logRequests || this.options.logRequests) util.log(params.entry);
			});

			resolve(tab);
		}).catch((err) => {
			reject(err);
		});
	});
};



chrome.loadUrlThenWaitForPageLoadEvent = function(tab, url) {
	return new Promise((resolve, reject) => {
		tab.prerender.url = url;

		var finished = false;
		const {
			Page
		} = tab;


		Page.enable()
		.then(() => {

			let pageDoneCheckInterval = tab.prerender.pageDoneCheckInterval || this.options.pageDoneCheckInterval;
			let pageLoadTimeout = tab.prerender.pageLoadTimeout || this.options.pageLoadTimeout;

			var checkIfDone = () => {
				if (finished) {return;}

				if ((tab.prerender.renderType === 'jpeg' || tab.prerender.renderType === 'png') && tab.prerender.fullpage) {
					tab.Runtime.evaluate({
						expression: 'window.scrollBy(0, window.innerHeight);'
					});
				}


				this.checkIfPageIsDoneLoading(tab).then((doneLoading) => {
					if (doneLoading && !finished) {
						finished = true;

						if ((tab.prerender.renderType === 'jpeg' || tab.prerender.renderType === 'png') && tab.prerender.fullpage) {
							tab.Runtime.evaluate({
								expression: 'window.scrollTo(0, 0);'
							});
						}

						resolve();
					}

					if (!doneLoading && !finished) {
						setTimeout(checkIfDone, pageDoneCheckInterval);
					}
				}).catch((e) => {
					finished = true;
					util.log('Chrome connection closed during request');
					tab.prerender.statusCode = 504;
					reject();
				});
			};

			setTimeout(() => {
				if (!finished) {
					finished = true;
					util.log('page timed out', tab.prerender.url);
					resolve();
				}
			}, pageLoadTimeout);

			Page.navigate({
				url: tab.prerender.url
			}).then(() => {
				setTimeout(checkIfDone, pageDoneCheckInterval);
			}).catch(() => {
				util.log('invalid URL sent to Chrome:', tab.prerender.url);
				tab.prerender.statusCode = 504;
				finished = true;
				reject();
			});
		}).catch((err) => {
			util.log('unable to load URL', err);
			tab.prerender.statusCode = 504;
			finished = true;
			reject();
		});
	});
};



chrome.checkIfPageIsDoneLoading = function(tab) {
	return new Promise((resolve, reject) => {
		tab.Runtime.evaluate({
			expression: 'window.prerenderReady'
		}).then((result) => {
			let prerenderReady = result && result.result && result.result.value;
			let shouldWaitForPrerenderReady = typeof prerenderReady == 'boolean';
			let waitAfterLastRequest = tab.prerender.waitAfterLastRequest || this.options.waitAfterLastRequest;

			let doneLoading = tab.prerender.numRequestsInFlight <= 0 &&
				tab.prerender.lastRequestReceivedAt < ((new Date()).getTime() - waitAfterLastRequest)

			resolve((!shouldWaitForPrerenderReady && doneLoading) || (shouldWaitForPrerenderReady && doneLoading && prerenderReady));
		}).catch((err) => {
			util.log('unable to evaluate javascript on the page');
			tab.prerender.statusCode = 504;
			reject();
		});
	});

};



chrome.executeJavascript = function(tab, javascript) {
	return new Promise((resolve, reject) => {
		tab.Runtime.evaluate({
			expression: javascript
		}).then((result) => {

			//give previous javascript a little time to execute
			setTimeout( () => {

				tab.Runtime.evaluate({
					expression: 'JSON.stringify(window.prerenderData)'
				}).then((result) => {
					tab.prerender.prerenderData = JSON.parse(result && result.result && result.result.value);
					resolve();
				}).catch((err) => {
					util.log('unable to evaluate javascript on the page');
					tab.prerender.statusCode = 504;
					reject();
				});

			}, 1000);
		}).catch((err) => {
			util.log('unable to evaluate javascript on the page');
			tab.prerender.statusCode = 504;
			reject();
		});
	});
};



chrome.parseHtmlFromPage = function(tab) {
	return new Promise((resolve, reject) => {

		var parseTimeout = setTimeout(() => {
			util.log('parse html timed out', tab.prerender.url);
			tab.prerender.statusCode = 504;
			reject();
		}, 5000);

		tab.Runtime.evaluate({
			expression: "document.getElementsByTagName('html')[0].outerHTML"
		}).then((resp) => {

			tab.prerender.content = resp.result.value;
			return tab.Runtime.evaluate({
				expression: 'document.doctype'
			});
		}).then((response) => {

			let doctype = '';
			if (response && response.result && response.result.description) {
				doctype = response.result.description;
			}

			tab.prerender.content = doctype + tab.prerender.content;
			clearTimeout(parseTimeout);
			resolve();
		}).catch((err) => {
			util.log('unable to parse HTML', err);
			tab.prerender.statusCode = 504;
			clearTimeout(parseTimeout);
			reject();
		});
	});
};


chrome.captureScreenshot = function(tab, format, fullpage) {
	return new Promise((resolve, reject) => {

		var parseTimeout = setTimeout(() => {
			util.log('capture screenshot timed out for', tab.prerender.url);
			tab.prerender.statusCode = 504;
			reject();
		}, 10000);

		tab.Page.getLayoutMetrics().then((viewports) => {

			let viewportClip = {
				x: 0,
				y: 0,
				width: viewports.visualViewport.clientWidth,
				height: viewports.visualViewport.clientHeight,
				scale: viewports.visualViewport.scale || 1
			};

			if (fullpage) {
				viewportClip.width = viewports.contentSize.width;
				viewportClip.height = viewports.contentSize.height;
			}

			tab.Page.captureScreenshot({
				format: format,
				clip: viewportClip
			}).then((response) => {
				tab.prerender.content = new Buffer(response.data, 'base64');
				clearTimeout(parseTimeout);
				resolve();
			}).catch((err) => {
				util.log('unable to capture screenshot:', err);
				tab.prerender.statusCode = 504;
				clearTimeout(parseTimeout);
				reject();
			});
		});

	});
};


chrome.printToPDF = function(tab) {
	return new Promise((resolve, reject) => {

		var parseTimeout = setTimeout(() => {
			util.log('capture screenshot timed out for', tab.prerender.url);
			tab.prerender.statusCode = 504;
			reject();
		}, 5000);

		tab.Page.printToPDF({
			printBackground: true
		}).then((response) => {
			tab.prerender.content = new Buffer(response.data, 'base64');
			clearTimeout(parseTimeout);
			resolve();
		}).catch((err) => {
			util.log('unable to capture pdf:', err);
			tab.prerender.statusCode = 504;
			clearTimeout(parseTimeout);
			reject();
		});

	});
};


chrome.getHarFile = function(tab) {
	return new Promise((resolve, reject) => {

		tab.prerender.content = '';
		resolve();

	});
};