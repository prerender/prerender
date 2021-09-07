const util = require('../util.js');
const puppeteer = require('puppeteer');

const puppeteerChrome = exports = module.exports = {};

puppeteerChrome.name = 'Puppeteer';

const trace = (action, ...args) => {
	console.log('TTT', action.padEnd(10, ' '), ...args);
}

const getRequestId = (request) => request._requestId; // There is no getter for this

const getRedirectInfoFromRequest = (req) => {
	const redirectChain = req.redirectChain();
	if (redirectChain.length < 1) return {};

	const redirectResponse = redirectChain[0].response();
	if (!redirectResponse) return {};

	const status = redirectResponse.status();
	const headers = redirectResponse.headers();
	const statusText = redirectResponse.statusText();
	// const dataLength = await responseBufferLength(redirectResponse);

	return {status, headers, content: statusText };
	// return {status, headers, statusText, dataLength};
}

const responseBufferLength = async (response) => {
	try {
		const responseBuffer = await response.buffer();
		return responseBuffer.length;
	} catch {
		// For example redirects have no respones buffer
		return 0;
	}
}

// Flags to start chrome with
//const chromeFlags = [ '--headless', '--disable-gpu', '--hide-scrollbars', ];

// Local
// -----
// spawn (Uses chromeFlags)
// connect
// onClose
// kill
// openTab
// closeTab

// Browserless
// -------
// spawn  DOES NOTHING
// connect connects to the browser
// onClose
// kill DOES NOTHING
// openTab
// closeTab


const withTimeout = (f, timeout) => {
	return new Promise( (resolve, reject) => {
		let timedOut = false;
		const timeoutTimer = setTimeout(() => {
			timedOut = true;
			reject(new Error('timeout'));
		}, timeout);

		f().then( (result) => {
			if (timedOut) return; // The promise is already rejected
			clearTimeout(timeoutTimer);
			resolve(result);
		}).catch( (e) => {
			if (timedOut) return; // The promise is already rejected
			clearTimeout(timeoutTimer);
			reject(e);
		});
	} );
}


puppeteerChrome.spawn = async function (options) {
	trace("SPAWN", options);
	this.options = options;

	// this.chromeChild = spawn(location, this.options.chromeFlags || [
		// '--headless',
		// '--disable-gpu',
		// '--remote-debugging-port=' + this.options.browserDebuggingPort,
		// '--hide-scrollbars',
	// ]);
};



puppeteerChrome.onClose = async function (callback) {
	trace("ONCLOSE");
	// this.browser.on('disconnected', callback); // VCs Close ? puppeteer should not close...
};



puppeteerChrome.kill = function () {
	trace("KILL");
	// if (this.browser) {
		// this.browser.close();
		// this.browser.disconnect();
	// }
};

puppeteerChrome.killForRestart = function () {
	trace("KILL FOR RESTART");
	// in browserless mode we don't detach
};



puppeteerChrome.connect = async function () {
	trace("CONNECT SKIPPED");
	// await withTimeout( async () => {
	// 	this.originalUserAgent = await this.browser.userAgent();
	// 	this.version = await this.browser.version();
	// }, 20 * 1000)
};

puppeteerChrome.openTab = async function (options) {
	trace('OPENTAB');

	const serverlessCluster = this.options.serverlessCluster;
	const browser = await puppeteer.connect({ browserWSEndpoint: serverlessCluster});
	// this.browser = browser;
	this.originalUserAgent = await browser.userAgent();
	this.version = await browser.version();

	trace("CONNECTED TO BROWSER");
	const browserContext = await browser.createIncognitoBrowserContext();
	const page = await browserContext.newPage();
	page.prerender = options;
	page.prerender.requests = {};
	page.prerender.numRequestsInFlight = 0;
	page.prerender.pageContext = browserContext;

	// Slow down for testing
	// page.emulateNetworkConditions({upload: 0.5*1024, download: 0.5*1024, latency: 0});

	await this.setUpEvents(page);
	return page;
};



puppeteerChrome.closeTab = async function (tab) {
	trace("CLOSE TAB");
	await tab.prerender.pageContext.close();
};


puppeteerChrome.setUpEvents = async function (tab) {
	const page = tab;

	// hold onto info that could be used later if saving a HAR file
	tab.prerender.pageLoadInfo = {
		url: tab.prerender.url,
		firstRequestId: undefined,
		firstRequestMs: undefined,
		domContentEventFiredMs: undefined,
		loadEventFiredMs: undefined,
		entries: {},
		logEntries: [],
		user: undefined
	};

	// set overrides
	await this.setOverrideCertificateErrors(page);

	const userAgent = (
		tab.prerender.userAgent ||
		this.options.userAgent ||
		`${this.originalUserAgent} Prerender (+https://github.com/prerender/prerender)`
	);
	page.setUserAgent(userAgent);

	let width = parseInt(tab.prerender.width, 10) || 1440;
	let height = parseInt(tab.prerender.height, 10) || 718;

	// Emulation.setDeviceMetricsOverride({
	// 	width: width,
	// 	screenWidth: width,
	// 	height: height,
	// 	screenHeight: height,
	// 	deviceScaleFactor: 0,
	// 	mobile: false
	// });
	page.setViewport({
		width,
		height,
		// deviceScaleFactor: 0, TODO VCs 0 ?
		isMobile: false,

	})

	// let bypassServiceWorker = !(this.options.enableServiceWorker == true || this.options.enableServiceWorker == 'true');
	// if (typeof tab.prerender.enableServiceWorker !== 'undefined') {
	// 	bypassServiceWorker = !tab.prerender.enableServiceWorker;
	// }
	// await Network.setBypassServiceWorker({ bypass: bypassServiceWorker });
	await this.bypassServiceWorker(page);

	// set up handlers
	page.on('domcontentloaded', () => {
		trace("EVENT DOMCONTENTLOADED");
		const timestamp = new Date().getTime();
		trace('domcontentloaded timestamp', timestamp)
		tab.prerender.domContentEventFired = true;
		tab.prerender.pageLoadInfo.domContentEventFiredMs = timestamp * 1000;
	});

	page.on('load', () => {
		trace("EVENT LOAD");
		const timestamp = new Date().getTime();
		trace('load', timestamp);
		tab.prerender.pageLoadInfo.loadEventFiredMs = timestamp * 1000;
	});

	page.on('dialog', async (dialog) => {
		const timestamp = new Date().getTime();
		trace('dialog', timestamp);
		setTimeout(() => {
			dialog.accept();
		}, 1000);
	});

	page.on('request', async (request) => {
		const requestId = getRequestId(request);
		const timestamp = new Date().getTime();
		const url = request.url();
		trace('request', requestId, url);

	 	tab.prerender.numRequestsInFlight++;
	 	tab.prerender.requests[requestId] = url;
		if (tab.prerender.logRequests || this.options.logRequests) util.log('+', tab.prerender.numRequestsInFlight, url);

		if (!tab.prerender.initialRequestId) {
			tab.prerender.initialRequestId = requestId;
			tab.prerender.pageLoadInfo.firstRequestId = requestId;
			tab.prerender.pageLoadInfo.firstRequestMs = timestamp;
		}

		tab.prerender.pageLoadInfo.entries[requestId] = {
			request: request,
			response: undefined,
			responseLength: 0,
			// encodedResponseLength: undefined,
			responseFinishedS: undefined,
			responseFailedS: undefined,
			responseBody: undefined,
			// responseBodyIsBase64: undefined,
			// newPriority: undefined,

			wallTime: timestamp,

		};

		if (request.redirectChain().length > 0) {
			const redirectRequest = request.redirectChain()[0]
			trace("REDIRECT CHAIN", redirectRequest._url, request._url);
			//during a redirect, we don't get the responseReceived event for the original request,
			//so lets decrement the number of requests in flight here.
			//the original requestId is also reused for the redirected request
			tab.prerender.numRequestsInFlight--;

			const redirectEntry = tab.prerender.pageLoadInfo.entries[requestId];
			redirectEntry.response = redirectRequest.response();
			redirectEntry.responseFinishedS = timestamp;

			if (tab.prerender.initialRequestId === requestId && !tab.prerender.followRedirects && !this.options.followRedirects) {
				tab.prerender.receivedRedirect = true; //initial response of a 301 gets modified so we need to capture that we saw a redirect here
				tab.prerender.lastRequestReceivedAt = timestamp;
				const { status, headers, statusText } = getRedirectInfoFromRequest(request);
				tab.prerender.statusCode = status;
				tab.prerender.headers = headers;
				tab.prerender.content = statusText;

				await this.stopLoading(tab);
			}
		}
	});

	page.on('response', (response) => {
		const requestId = getRequestId(response.request());
		trace('response', requestId);

		const entry = tab.prerender.pageLoadInfo.entries[requestId];
		entry.response = response;
		if (entry && response.ok()) { // Response ok(): for example redirects do not have a response
			responseBufferLength(response)
				.then((size) => { entry.responseLength += size })
				.catch((err) => { console.log("No buffer error", err) });
		}

		if (requestId === tab.prerender.initialRequestId && !tab.prerender.receivedRedirect) {
			const status = response.status();
			const headers = response.headers();

			tab.prerender.statusCode = status;
			tab.prerender.headers = headers;

			//if we get a 304 from the server, turn it into a 200 on our end
			if (tab.prerender.statusCode == 304) tab.prerender.statusCode = 200;
		}
	});

	page.on('requestfinished', (request) => {
		const requestId = getRequestId(request);
		const timestamp = new Date().getTime();
		trace('requestfinished I', requestId);
		// trace("EVENT REQUEST FINISHED", requestId);
		if (tab.prerender.requests[requestId]) {
			tab.prerender.numRequestsInFlight--;
			tab.prerender.lastRequestReceivedAt = timestamp;

			if (tab.prerender.logRequests || this.options.logRequests) util.log('-', tab.prerender.numRequestsInFlight, tab.prerender.requests[requestId]);

			delete tab.prerender.requests[requestId];

			let entry = tab.prerender.pageLoadInfo.entries[requestId];
			if (!entry) {
				return;
			}
			entry.responseFinishedS = timestamp;
		}
	});

	page.on('requestfailed', (request) => {
		const requestId = getRequestId(request);
		trace('requestfailed II ', requestId);
		const timestamp = new Date().getTime();
		if (tab.prerender.requests[requestId]) {
			tab.prerender.numRequestsInFlight--;
			if (tab.prerender.logRequests || this.options.logRequests) util.log('-', tab.prerender.numRequestsInFlight, tab.prerender.requests[requestId]);
			delete tab.prerender.requests[requestId];

			let entry = tab.prerender.pageLoadInfo.entries[requestId];
			if (entry) {
				entry.responseFailedS = timestamp;
			}
		}
	});

	// <del>Console is deprecated, kept for backwards compatibility</del>
	// It's still in use and can't get console-log from Log.entryAdded event
	page.on('console', (msg) => {
		if (tab.prerender.captureConsoleLog || this.options.captureConsoleLog) {

			tab.prerender.pageLoadInfo.logEntries.push({
				...msg.text(),
				// to keep consistent with Log.LogEntry
				// lineNumber: message.line,
				timestamp: new Date().getTime(),
			});
		}

		if (tab.prerender.logRequests || this.options.logRequests) {
			util.log('level:', msg.type(), 'text:', msg.text(), 'url:', undefined, 'line:', undefined);
		}
	});

	return tab;
};



puppeteerChrome.loadUrlThenWaitForPageLoadEvent =  function (tab, url) {
	return new Promise( (resolve, reject) => {
		trace('loadUrlThenWaitForPageLoadEvent', url);
		tab.prerender.url = url;

		let finished = false;

		const page = tab;

		try {
			let pageDoneCheckInterval = tab.prerender.pageDoneCheckInterval || this.options.pageDoneCheckInterval;
			let pageLoadTimeout = tab.prerender.pageLoadTimeout || this.options.pageLoadTimeout;
			console.log("pageDoneCheckInterval",pageDoneCheckInterval)
			console.log("pageLoadTimeout",pageLoadTimeout)

			const checkIfDone = () => {
				trace('CHECK IF DONE', url);
				if (finished) { trace("Finished!!!!!!!!!!!"); return; }

				if ((tab.prerender.renderType === 'jpeg' || tab.prerender.renderType === 'png') && tab.prerender.fullpage) {
					page.evaluate( () => {
						window.scrollBy(0, window.innerHeight);
					});
				}


				this.checkIfPageIsDoneLoading(tab).then((doneLoading) => {
					if (doneLoading && !finished) {
						finished = true;

						if ((tab.prerender.renderType === 'jpeg' || tab.prerender.renderType === 'png') && tab.prerender.fullpage) {
							page.evaluate( () => {
								window.scrollTo(0, 0);
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
					reject(e);
				});
			};

			tab.evaluateOnNewDocument( () => {
				if (window.customElements) customElements.forcePolyfill = true;
			} );
			tab.evaluateOnNewDocument( () => {
				ShadyDOM = {force: true};
			} );
			tab.evaluateOnNewDocument( () => {
				ShadyCSS = {shimcssproperties: true};
			} );

			setTimeout(checkIfDone, pageDoneCheckInterval);

			page.goto(
				tab.prerender.url,
				{
					timeout: pageLoadTimeout,
					waitUntil: "networkidle0", // No network requests for 500ms
				}
			).then(() => {
				finished = true;
				resolve();

			}).catch((e) => {
				if (page.loadingStopped) {
					finished = true;
					resolve();
				} else if (e.name === 'TimeoutError') {
					util.log('page timed out', tab.prerender.url);

					const timeoutStatusCode = tab.prerender.timeoutStatusCode || this.options.timeoutStatusCode;
					if (timeoutStatusCode) {
						tab.prerender.statusCode = timeoutStatusCode;
					}
					finished = true;
					resolve();
				} else {
					console.log("page.goto failed", e);
					util.log('invalid URL sent to Chrome:', tab.prerender.url);
					tab.prerender.statusCode = 504;
					finished = true;
					reject();
				}
			});
		} catch (err) {
			util.log('unable to load URL', err);
			tab.prerender.statusCode = 504;
			finished = true;
			reject();
		};
	});
};



puppeteerChrome.checkIfPageIsDoneLoading = function (tab) {
	return new Promise((resolve, reject) => {
		trace("CHECK IF PAGE DONE LOADING", tab.prerender.numRequestsInFlight, tab.prerender.requests);

		if (tab.prerender.receivedRedirect) {
			return resolve(true);
		}

		if (!tab.prerender.domContentEventFired) {
			return resolve(false);
		}

		return tab.evaluate(() => {
			return window.prerenderReady;
		}).then((result) => {
			const prerenderReady = result;
			const shouldWaitForPrerenderReady = typeof prerenderReady == 'boolean';
			const waitAfterLastRequest = tab.prerender.waitAfterLastRequest || this.options.waitAfterLastRequest;

			const prerenderReadyDelay = tab.prerender.prerenderReadyDelay || 1000;

			if (prerenderReady && shouldWaitForPrerenderReady && !tab.prerender.firstPrerenderReadyTime) {
				tab.prerender.firstPrerenderReadyTime = new Date().getTime();
			}

			const doneLoading = tab.prerender.numRequestsInFlight <= 0 &&
				tab.prerender.lastRequestReceivedAt < ((new Date()).getTime() - waitAfterLastRequest)

			const timeSpentAfterFirstPrerenderReady = (tab.prerender.firstPrerenderReadyTime && (new Date().getTime() - tab.prerender.firstPrerenderReadyTime)) || 0;

			const ready =
				(!shouldWaitForPrerenderReady && doneLoading) ||
				(shouldWaitForPrerenderReady && prerenderReady && (doneLoading || timeSpentAfterFirstPrerenderReady > prerenderReadyDelay))
			trace("checkIfPageDoneLoading ready", ready);
			resolve(ready);
		}).catch((err) => {
			util.log('unable to evaluate javascript on the page 1', err);
			tab.prerender.statusCode = 504;
			reject();
		});
	});

};


// TODO: VCs implement
puppeteerChrome.executeJavascript = function (tab, javascript) {
	throw('Unimplemented!');
	// return new Promise((resolve, reject) => {
	// 	tab.Runtime.evaluate({
	// 		expression: javascript
	// 	}).then((result) => {

	// 		//give previous javascript a little time to execute
	// 		setTimeout(() => {

	// 			tab.Runtime.evaluate({
	// 				expression: "(window.prerenderData && typeof window.prerenderData == 'object' && JSON.stringify(window.prerenderData)) || window.prerenderData"
	// 			}).then((result) => {
	// 				try {
	// 					tab.prerender.prerenderData = JSON.parse(result && result.result && result.result.value);
	// 				} catch (e) {
	// 					tab.prerender.prerenderData = result.result.value;
	// 				}
	// 				resolve();
	// 			}).catch((err) => {
	// 				util.log('unable to evaluate javascript on the page 2', err);
	// 				tab.prerender.statusCode = 504;
	// 				reject();
	// 			});

	// 		}, 1000);
	// 	}).catch((err) => {
	// 		util.log('unable to evaluate javascript on the page 3', err);
	// 		tab.prerender.statusCode = 504;
	// 		reject();
	// 	});
	// });
};

puppeteerChrome.parseHtmlFromPage = (tab) => {
	trace("PARSE HTML FROM PAGE");
	return withTimeout( async () => {
		try {
			const page = tab;
			const content = await page.evaluate( () => {
				return document.firstElementChild.outerHTML
			})
			tab.prerender.content = content;
			const response = await page.evaluate(() => {
				return document.doctype && JSON.stringify({name: document.doctype.name, systemId: document.doctype.systemId, publicId: document.doctype.publicId})
			})
			let doctype = '';
			if (response) {
				let obj = { name: 'html' };
				try {
					obj = JSON.parse(response);
				} catch (e) { }

				doctype = "<!DOCTYPE "
					+ obj.name
					+ (obj.publicId ? ' PUBLIC "' + obj.publicId + '"' : '')
					+ (!obj.publicId && obj.systemId ? ' SYSTEM' : '')
					+ (obj.systemId ? ' "' + obj.systemId + '"' : '')
					+ '>'
			}

			tab.prerender.content = doctype + tab.prerender.content;
		} catch (err) {
			util.log('unable to parse HTML', err);
			tab.prerender.statusCode = 504;
			throw err;
		}

	}, 5000);
};

puppeteerChrome.stopLoading = function (page) {
	page.loadingStopped = true;
	return page._client.send('Page.stopLoading');
}

puppeteerChrome.bypassServiceWorker = function (page) {
	// TODO VCs test me
	let bypassServiceWorker = !(this.options.enableServiceWorker == true || this.options.enableServiceWorker == 'true');
	if (typeof page.prerender.enableServiceWorker !== 'undefined') {
		bypassServiceWorker = !page.prerender.enableServiceWorker;
	}
	bypassServiceWorker = false;
	return page._client.send('Network.setBypassServiceWorker', { bypass: bypassServiceWorker });
}

puppeteerChrome.setOverrideCertificateErrors = function (page) {

	// TODO VCs test me
	return page._client.send('Security.setIgnoreCertificateErrors', { ignore: true });
}

puppeteerChrome.captureScreenshot = function (tab, format, fullpage) {
	return new Promise((_resolve, reject) => {
		// No longer required feature
		reject('Unimplemented');
	});

	// 	var parseTimeout = setTimeout(() => {
	// 		util.log('capture screenshot timed out for', tab.prerender.url);
	// 		tab.prerender.statusCode = 504;
	// 		reject();
	// 	}, 10000);

	// 	tab.Page.getLayoutMetrics().then((viewports) => {

	// 		let viewportClip = {
	// 			x: 0,
	// 			y: 0,
	// 			width: viewports.visualViewport.clientWidth,
	// 			height: viewports.visualViewport.clientHeight,
	// 			scale: viewports.visualViewport.scale || 1
	// 		};

	// 		if (fullpage) {
	// 			viewportClip.width = viewports.contentSize.width;
	// 			viewportClip.height = viewports.contentSize.height;
	// 		}

	// 		tab.Page.captureScreenshot({
	// 			format: format,
	// 			clip: viewportClip
	// 		}).then((response) => {
	// 			tab.prerender.content = new Buffer(response.data, 'base64');
	// 			clearTimeout(parseTimeout);
	// 			resolve();
	// 		}).catch((err) => {
	// 			util.log('unable to capture screenshot:', err);
	// 			tab.prerender.statusCode = 504;
	// 			clearTimeout(parseTimeout);
	// 			reject();
	// 		});
	// 	});

	// });
};


// TODO: VCs implement
puppeteerChrome.printToPDF = (tab, options) => {
	return new Promise((_resolve, reject) => {
		// No longer required feature
		reject('Unimplemented');
	});
	// return new Promise((resolve, reject) => {

	// 	var parseTimeout = setTimeout(() => {
	// 		util.log('print pdf timed out for', tab.prerender.url);
	// 		tab.prerender.statusCode = 504;
	// 		reject();
	// 	}, 5000);

	// 	tab.Page.printToPDF(options).then((response) => {
	// 		tab.prerender.content = new Buffer(response.data, 'base64');
	// 		clearTimeout(parseTimeout);
	// 		resolve();
	// 	}).catch((err) => {
	// 		util.log('unable to capture pdf:', err);
	// 		tab.prerender.statusCode = 504;
	// 		clearTimeout(parseTimeout);
	// 		reject();
	// 	});

	// });
};


// TODO: VCs there is a support package for this: https://github.com/Everettss/puppeteer-har
// puppeteerChrome.getHarFile = function (tab) {
// 	return new Promise((resolve, reject) => {

// 		var packageInfo = require('../../package');

// 		const firstRequest = tab.prerender.pageLoadInfo.entries[tab.prerender.pageLoadInfo.firstRequestId];//.requestParams;
// 		const wallTimeMs = firstRequest.wallTime * 1000;
// 		const startedDateTime = new Date(wallTimeMs).toISOString();
// 		const onContentLoad = tab.prerender.pageLoadInfo.domContentEventFiredMs - tab.prerender.pageLoadInfo.firstRequestMs;
// 		const onLoad = tab.prerender.pageLoadInfo.loadEventFiredMs - tab.prerender.pageLoadInfo.firstRequestMs;
// 		const entries = parseEntries(tab.prerender.pageLoadInfo.entries);

// 		tab.prerender.content = {
// 			log: {
// 				version: '1.2',
// 				creator: {
// 					name: 'Prerender HAR Capturer',
// 					version: packageInfo.version,
// 					comment: packageInfo.homepage
// 				},
// 				pages: [
// 					{
// 						id: 'page_1',
// 						title: tab.prerender.url,
// 						startedDateTime: startedDateTime,
// 						pageTimings: {
// 							onContentLoad: onContentLoad,
// 							onLoad: onLoad
// 						}
// 					}
// 				],
// 				entries: entries
// 			}
// 		};

// 		resolve();

// 	});
// };



// function parseEntries(entries) {

// 	let harEntries = [];

// 	Object.keys(entries).forEach((key) => {

// 		let entry = entries[key];

// 		if (!entry.responseParams || !entry.responseFinishedS && !entry.responseFailedS) {
// 			return null;
// 		}

// 		if (!entry.responseParams.response.timing) {
// 			return null;
// 		}

// 		const { request } = entry.requestParams;
// 		const { response } = entry.responseParams;

// 		const wallTimeMs = entry.requestParams.wallTime * 1000;
// 		const startedDateTime = new Date(wallTimeMs).toISOString();
// 		const httpVersion = response.protocol || 'unknown';
// 		const { method } = request;
// 		const loadedUrl = request.url;
// 		const { status, statusText } = response;
// 		const headers = parseHeaders(httpVersion, request, response);
// 		const redirectURL = getHeaderValue(response.headers, 'location', '');
// 		const queryString = url.parse(request.url, true).query;
// 		const { time, timings } = computeTimings(entry);

// 		let serverIPAddress = response.remoteIPAddress;
// 		if (serverIPAddress) {
// 			serverIPAddress = serverIPAddress.replace(/^\[(.*)\]$/, '$1');
// 		}

// 		const connection = String(response.connectionId);
// 		// const _initiator = entry.requestParams.initiator;
// 		const { changedPriority } = entry;
// 		const newPriority = changedPriority && changedPriority.newPriority;
// 		const _priority = newPriority || request.initialPriority;
// 		const payload = computePayload(entry, headers);
// 		const { mimeType } = response;
// 		const encoding = entry.responseBodyIsBase64 ? 'base64' : undefined;

// 		harEntries.push({
// 			pageref: 'page_1',
// 			startedDateTime,
// 			time,
// 			request: {
// 				method,
// 				url: loadedUrl,
// 				httpVersion,
// 				cookies: [], // TODO
// 				headers: headers.request.pairs,
// 				queryString,
// 				headersSize: headers.request.size,
// 				bodySize: payload.request.bodySize
// 				// TODO postData
// 			},
// 			response: {
// 				status,
// 				statusText,
// 				httpVersion,
// 				cookies: [], // TODO
// 				headers: headers.response.pairs,
// 				redirectURL,
// 				headersSize: headers.response.size,
// 				bodySize: payload.response.bodySize,
// 				_transferSize: payload.response.transferSize,
// 				content: {
// 					size: entry.responseLength,
// 					mimeType,
// 					compression: payload.response.compression,
// 					text: entry.responseBody,
// 					encoding
// 				}
// 			},
// 			cache: {},
// 			timings,
// 			serverIPAddress,
// 			connection,
// 			_initiator,
// 			_priority
// 		});
// 	});

// 	return harEntries;
// };


// function parseHeaders(httpVersion, request, response) {
// 	// convert headers from map to pairs
// 	const requestHeaders = response.requestHeaders || request.headers;
// 	const responseHeaders = response.headers;
// 	const headers = {
// 		request: {
// 			map: requestHeaders,
// 			pairs: zipNameValue(requestHeaders),
// 			size: -1
// 		},
// 		response: {
// 			map: responseHeaders,
// 			pairs: zipNameValue(responseHeaders),
// 			size: -1
// 		}
// 	};
// 	// estimate the header size (including HTTP status line) according to the
// 	// protocol (this information not available due to possible compression in
// 	// newer versions of HTTP)
// 	if (httpVersion.match(/^http\/[01].[01]$/)) {
// 		const requestText = getRawRequest(request, headers.request.pairs);
// 		const responseText = getRawResponse(response, headers.response.pairs);
// 		headers.request.size = requestText.length;
// 		headers.response.size = responseText.length;
// 	}
// 	return headers;
// }


// function computePayload(entry, headers) {
// 	// From Chrome:
// 	//  - responseHeaders.size: size of the headers if available (otherwise
// 	//    -1, e.g., HTTP/2)
// 	//  - entry.responseLength: actual *decoded* body size
// 	//  - entry.encodedResponseLength: total on-the-wire data
// 	//
// 	// To HAR:
// 	//  - headersSize: size of the headers if available (otherwise -1, e.g.,
// 	//    HTTP/2)
// 	//  - bodySize: *encoded* body size
// 	//  - _transferSize: total on-the-wire data
// 	//  - content.size: *decoded* body size
// 	//  - content.compression: *decoded* body size - *encoded* body size
// 	let bodySize;
// 	let compression;
// 	let transferSize = entry.encodedResponseLength;
// 	if (headers.response.size === -1) {
// 		// if the headers size is not available (e.g., newer versions of
// 		// HTTP) then there is no way (?) to figure out the encoded body
// 		// size (see #27)
// 		bodySize = -1;
// 		compression = undefined;
// 	} else if (entry.responseFailedS) {
// 		// for failed requests (`Network.loadingFailed`) the transferSize is
// 		// just the header size, since that evend does not hold the
// 		// `encodedDataLength` field, this is performed manually (however this
// 		// cannot be done for HTTP/2 which is handled by the above if)
// 		bodySize = 0;
// 		compression = 0;
// 		transferSize = headers.response.size;
// 	} else {
// 		// otherwise the encoded body size can be obtained as follows
// 		bodySize = entry.encodedResponseLength - headers.response.size;
// 		compression = entry.responseLength - bodySize;
// 	}
// 	return {
// 		request: {
// 			// trivial case for request
// 			bodySize: parseInt(getHeaderValue(headers.request.map, 'content-length', -1), 10)
// 		},
// 		response: {
// 			bodySize,
// 			transferSize,
// 			compression
// 		}
// 	};
// }


// function zipNameValue(map) {
// 	const pairs = [];

// 	Object.keys(map).forEach(function (name) {
// 		const value = map[name];
// 		const values = Array.isArray(value) ? value : [value];
// 		for (const value of values) {
// 			pairs.push({ name, value });
// 		}
// 	});
// 	return pairs;
// }

// function getRawRequest(request, headerPairs) {
// 	const { method, url, protocol } = request;
// 	const lines = [`${method} ${url} ${protocol}`];
// 	for (const { name, value } of headerPairs) {
// 		lines.push(`${name}: ${value}`);
// 	}
// 	lines.push('', '');
// 	return lines.join('\r\n');
// }

// function getRawResponse(response, headerPairs) {
// 	const { status, statusText, protocol } = response;
// 	const lines = [`${protocol} ${status} ${statusText}`];
// 	for (const { name, value } of headerPairs) {
// 		lines.push(`${name}: ${value}`);
// 	}
// 	lines.push('', '');
// 	return lines.join('\r\n');
// }


// function getHeaderValue(headers, name, fallback) {
// 	const pattern = new RegExp(`^${name}$`, 'i');
// 	const key = Object.keys(headers).find((name) => {
// 		return name.match(pattern);
// 	});
// 	return key === undefined ? fallback : headers[key];
// };


// function computeTimings(entry) {
// 	// https://chromium.googlesource.com/chromium/blink.git/+/master/Source/devtools/front_end/sdk/HAREntry.js
// 	// fetch the original timing object and compute duration
// 	const timing = entry.responseParams.response.timing;
// 	const finishedTimestamp = entry.responseFinishedS || entry.responseFailedS;
// 	const time = toMilliseconds(finishedTimestamp - timing.requestTime);
// 	// compute individual components
// 	const blocked = firstNonNegative([
// 		timing.dnsStart, timing.connectStart, timing.sendStart
// 	]);
// 	let dns = -1;
// 	if (timing.dnsStart >= 0) {
// 		const start = firstNonNegative([timing.connectStart, timing.sendStart]);
// 		dns = start - timing.dnsStart;
// 	}
// 	let connect = -1;
// 	if (timing.connectStart >= 0) {
// 		connect = timing.sendStart - timing.connectStart;
// 	}
// 	const send = timing.sendEnd - timing.sendStart;
// 	const wait = timing.receiveHeadersEnd - timing.sendEnd;
// 	const receive = time - timing.receiveHeadersEnd;
// 	let ssl = -1;
// 	if (timing.sslStart >= 0 && timing.sslEnd >= 0) {
// 		ssl = timing.sslEnd - timing.sslStart;
// 	}
// 	return {
// 		time,
// 		timings: { blocked, dns, connect, send, wait, receive, ssl }
// 	};
// };


// function toMilliseconds(time) {
// 	return time === -1 ? -1 : time * 1000;
// }

// function firstNonNegative(values) {
// 	const value = values.find((value) => value >= 0);
// 	return value === undefined ? -1 : value;
// }
