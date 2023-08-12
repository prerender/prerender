const CDP = require('chrome-remote-interface');
const { spawn } = require('child_process');
const util = require('../util.js');
const fs = require('fs');
const os = require('os');
const url = require('url');

const chrome = exports = module.exports = {};

const sleep = (durationMs) => new Promise((resolve) => setTimeout(() => { resolve() }, durationMs));
const ChromeConnectionClosed = 'ChromeConnectionClosed';
const UnableToLoadURL = 'UnableToLoadURL';
const UnableToEvaluateJavascript = 'UnableToEvaluateJavascript';
const ParseHTMLTimedOut = 'ParseHTMLTimedOut';
const UnableToParseHTML = 'UnableToParseHTML';
const CaptureScreenshotTimedOut = 'CaptureScreenshotTimedOut';
const UnableToCaptureScreenshot = 'UnableToCaptureScreenshot';
const PrintPdfTimedOut = 'PrintPdfTimedOut';
const UnableToCapturePdf = 'UnableToCapturePdf';

chrome.name = 'Chrome';



chrome.spawn = function (options) {
	return new Promise((resolve, reject) => {
		this.options = options;
		let location = this.getChromeLocation();

		if (!fs.existsSync(location)) {
			util.log('unable to find Chrome install. Please specify with chromeLocation');
			return reject();
		}

		this.chromeChild = spawn(location, this.options.chromeFlags || [
			'--headless',
			'--disable-gpu',
			'--remote-debugging-port=' + this.options.browserDebuggingPort,
			'--hide-scrollbars',
		], {shell: true});

		resolve();
	});
};



chrome.onClose = function (callback) {
	this.chromeChild.on('close', callback);
};



chrome.kill = function () {
	if (this.chromeChild) {
		this.chromeChild.kill('SIGINT');
	}
};



chrome.connect = function () {
	return new Promise((resolve, reject) => {
		let connected = false;
		let timeout = setTimeout(() => {
			if (!connected) {
				reject();
			}
		}, 20 * 1000);

		let connect = () => {
			CDP.Version({ port: this.options.browserDebuggingPort }).then((info) => {

				this.originalUserAgent = info['User-Agent'];
				this.webSocketDebuggerURL = info.webSocketDebuggerUrl || 'ws://localhost:' + this.options.browserDebuggingPort + '/devtools/browser';
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



chrome.getChromeLocation = function () {
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



chrome.openTab = function (options) {
	return new Promise((resolve, reject) => {

		let browserContext = null;
		let browser = null;

		const connectToBrowser = async (target, port) => {
			let remainingRetries = 5;
			for(;;) {
				try {
					return await CDP({ target, port});
				} catch (err) {
					util.log(`Cannot connect to browser port=${port} remainingRetries=${remainingRetries}`, err);
					if (remainingRetries <= 0) {
						throw err;
					} else {
						remainingRetries -= 1;
						await sleep(500);
					}
				}
			}
		};

		connectToBrowser(this.webSocketDebuggerURL, this.options.browserDebuggingPort)
			.then((chromeBrowser) => {
				browser = chromeBrowser;

				return browser.Target.createBrowserContext();
			}).then(({ browserContextId }) => {

				browserContext = browserContextId;

				return browser.Target.createTarget({
					url: 'about:blank',
					browserContextId
				});
			}).then(({ targetId }) => {

				return connectToBrowser(targetId, this.options.browserDebuggingPort);
			}).then((tab) => {

				//we're going to put our state on the chrome tab for now
				//we should clean this up later
				tab.browserContextId = browserContext;
				tab.browser = browser;
				tab.prerender = options;
				tab.prerender.errors = [];
				tab.prerender.requests = {};
				tab.prerender.numRequestsInFlight = 0;

				return this.setUpEvents(tab);
			}).then((tab) => {

				resolve(tab);
			}).catch((err) => { reject(err) });
	});
};



chrome.closeTab = function (tab) {
	return new Promise((resolve, reject) => {

		tab.browser.Target.closeTarget({ targetId: tab.target })
			.then(() => {

				return tab.browser.Target.disposeBrowserContext({ browserContextId: tab.browserContextId });
			}).then(() => {

				return tab.browser.close();
			}).then(() => {

				resolve();
			}).catch((err) => {
				reject(err);
			});
	});
};



chrome.setUpEvents = async function (tab) {
	const {
		Page,
		Security,
		DOM,
		Network,
		Emulation,
		Log,
		Console
	} = tab;

	await Promise.all([
		DOM.enable(),
		Page.enable(),
		Security.enable(),
		Network.enable(),
		Log.enable(),
		Console.enable()
	]);

	//hold onto info that could be used later if saving a HAR file
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
	await Security.setOverrideCertificateErrors({ override: true });

	const userAgent = (
		tab.prerender.userAgent ||
		this.options.userAgent ||
		`${this.originalUserAgent} Prerender (+https://github.com/prerender/prerender)`
	);
	await Network.setUserAgentOverride({ userAgent });

	let bypassServiceWorker = !(this.options.enableServiceWorker == true || this.options.enableServiceWorker == 'true');
	if (typeof tab.prerender.enableServiceWorker !== 'undefined') {
		bypassServiceWorker = !tab.prerender.enableServiceWorker;
	}
	await Network.setBypassServiceWorker({ bypass: bypassServiceWorker });

	// set up handlers
	Page.domContentEventFired(({ timestamp }) => {
		tab.prerender.domContentEventFired = true;
		tab.prerender.pageLoadInfo.domContentEventFiredMs = timestamp * 1000;
	});

	Page.loadEventFired(({ timestamp }) => {
		tab.prerender.pageLoadInfo.loadEventFiredMs = timestamp * 1000;
	});

	//if the page opens up a javascript dialog, lets try to close it after 1s
	Page.javascriptDialogOpening(() => {
		setTimeout(() => {
			Page.handleJavaScriptDialog({ accept: true });
		}, 1000);
	});

	Security.certificateError(({ eventId }) => {
		Security.handleCertificateError({
			eventId,
			action: 'continue'
		}).catch((err) => {
			util.log('error handling certificate error:', err);
		});
	});

	Network.requestWillBeSent((params) => {
		tab.prerender.numRequestsInFlight++;
		tab.prerender.requests[params.requestId] = params.request.url;
		if (tab.prerender.logRequests || this.options.logRequests) util.log('+', tab.prerender.numRequestsInFlight, params.request.url);

		if (!tab.prerender.initialRequestId) {
			util.log(`Initial request to ${params.request.url}`);
			tab.prerender.initialRequestId = params.requestId;
			tab.prerender.pageLoadInfo.firstRequestId = params.requestId;
			tab.prerender.pageLoadInfo.firstRequestMs = params.timestamp * 1000;
		}

		tab.prerender.pageLoadInfo.entries[params.requestId] = {
			requestParams: params,
			responseParams: undefined,
			responseLength: 0,
			encodedResponseLength: undefined,
			responseFinishedS: undefined,
			responseFailedS: undefined,
			responseBody: undefined,
			responseBodyIsBase64: undefined,
			newPriority: undefined
		};

		if (params.redirectResponse) {
			//during a redirect, we don't get the responseReceived event for the original request,
			//so lets decrement the number of requests in flight here.
			//the original requestId is also reused for the redirected request
			tab.prerender.numRequestsInFlight--;

			let redirectEntry = tab.prerender.pageLoadInfo.entries[params.requestId];
			redirectEntry.responseParams = {
				response: params.redirectResponse
			};
			redirectEntry.responseFinishedS = params.timestamp;
			redirectEntry.encodedResponseLength = params.redirectResponse.encodedDataLength;

			if (tab.prerender.initialRequestId === params.requestId && !tab.prerender.followRedirects && !this.options.followRedirects) {
				util.log(`Initial request redirected from ${params.request.url} with status code ${params.redirectResponse.status}`);
				tab.prerender.receivedRedirect = true; //initial response of a 301 gets modified so we need to capture that we saw a redirect here
				tab.prerender.lastRequestReceivedAt = new Date().getTime();
				tab.prerender.statusCode = params.redirectResponse.status;
				tab.prerender.headers = params.redirectResponse.headers;
				tab.prerender.content = params.redirectResponse.statusText;

				Page.stopLoading().catch((err) => {
					util.log(`unable to stop loading page (redirect), url=${params.request.url}`, err);
				});
			}
		}
	});

	Network.dataReceived(({ requestId, dataLength }) => {
		let entry = tab.prerender.pageLoadInfo.entries[requestId];
		if (!entry) {
			return;
		}
		entry.responseLength += dataLength;
	});

	Network.responseReceived((params) => {
		let entry = tab.prerender.pageLoadInfo.entries[params.requestId];
		if (entry) {
			entry.responseParams = params;
		}

		if (params.requestId == tab.prerender.initialRequestId && !tab.prerender.receivedRedirect) {
			util.log(`Initial response from ${params.response.url} with status code ${params.response.status}`);
			tab.prerender.statusCode = params.response.status;
			tab.prerender.headers = params.response.headers;

			//if we get a 304 from the server, turn it into a 200 on our end
			if (tab.prerender.statusCode == 304) tab.prerender.statusCode = 200;
		}

		if (params.type === "EventSource") {
			tab.prerender.numRequestsInFlight--;
			tab.prerender.lastRequestReceivedAt = new Date().getTime();
			if (tab.prerender.logRequests || this.options.logRequests) util.log('-', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
			delete tab.prerender.requests[params.requestId];
		}

		if (params.response && params.response.status >= 500 && params.response.status < 600) { // 5XX
			tab.prerender.dirtyRender = true;
		}
	});

	Network.resourceChangedPriority(({ requestId, newPriority }) => {
		let entry = tab.prerender.pageLoadInfo.entries[requestId];
		if (!entry) {
			return;
		}
		entry.newPriority = newPriority;
	});

	Network.loadingFinished(({ requestId, timestamp, encodedDataLength }) => {
		const request = tab.prerender.requests[requestId];
		if (request) {
			if (tab.prerender.initialRequestId === requestId) {
				util.log(`Initial request finished ${request}`);
			}

			tab.prerender.numRequestsInFlight--;
			tab.prerender.lastRequestReceivedAt = new Date().getTime();

			if (tab.prerender.logRequests || this.options.logRequests) util.log('-', tab.prerender.numRequestsInFlight, tab.prerender.requests[requestId]);
			delete tab.prerender.requests[requestId];

			let entry = tab.prerender.pageLoadInfo.entries[requestId];
			if (!entry) {
				return;
			}
			entry.encodedResponseLength = encodedDataLength;
			entry.responseFinishedS = timestamp;
		}
	});

	//when a redirect happens and we call Page.stopLoading,
	//all outstanding requests will fire this event
	Network.loadingFailed((params) => {
		if (tab.prerender.requests[params.requestId]) {
			tab.prerender.numRequestsInFlight--;
			if (tab.prerender.logRequests || this.options.logRequests) util.log('-', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
			delete tab.prerender.requests[params.requestId];

			let entry = tab.prerender.pageLoadInfo.entries[params.requestId];
			if (entry) {
				entry.responseFailedS = params.timestamp;
			}
		}
	});

	// <del>Console is deprecated, kept for backwards compatibility</del>
	// It's still in use and can't get console-log from Log.entryAdded event
	Console.messageAdded((params) => {
		if (tab.prerender.captureConsoleLog || this.options.captureConsoleLog) {
			const message = params.message;

			tab.prerender.pageLoadInfo.logEntries.push({
				...message,
				// to keep consistent with Log.LogEntry
				lineNumber: message.line,
				timestamp: new Date().getTime()
			});
		}

		if (tab.prerender.logRequests || this.options.logRequests) {
			const message = params.message;
			util.log('level:', message.level, 'text:', message.text, 'url:', message.url, 'line:', message.line);
		}
	});

	Log.entryAdded((params) => {
		tab.prerender.pageLoadInfo.logEntries.push(params.entry);
		if (tab.prerender.logRequests || this.options.logRequests) util.log(params.entry);
	});

	return tab;
};



chrome.loadUrlThenWaitForPageLoadEvent = function (tab, url, onNavigated) {
	return new Promise((resolve, reject) => {
		tab.prerender.url = url;

		var finished = false;
		const {
			Page,
			Emulation
		} = tab;


		Page.enable()
			.then(() => {

				let pageDoneCheckInterval = tab.prerender.pageDoneCheckInterval || this.options.pageDoneCheckInterval;
				let pageLoadTimeout = tab.prerender.pageLoadTimeout || this.options.pageLoadTimeout;

				var checkIfDone = () => {
					if (finished) { return; }

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
						tab.prerender.errors.push(ChromeConnectionClosed);
						tab.prerender.statusCode = 504;
						reject();
					});
				};

				setTimeout(() => {
					if (!finished) {
						finished = true;
						util.log('page timed out', tab.prerender.url);

						const timeoutStatusCode = tab.prerender.timeoutStatusCode || this.options.timeoutStatusCode;
						if (timeoutStatusCode) {
							tab.prerender.statusCode = timeoutStatusCode;
						}
						tab.prerender.timedout = true;

						resolve();
					}
				}, pageLoadTimeout);

				if (!tab.prerender.skipCustomElementsForcePolyfill) {
					Page.addScriptToEvaluateOnNewDocument({ source: 'if (window.customElements) customElements.forcePolyfill = true' })
				}
				Page.addScriptToEvaluateOnNewDocument({ source: 'ShadyDOM = {force: true}' })
				Page.addScriptToEvaluateOnNewDocument({ source: 'ShadyCSS = {shimcssproperties: true}' })

				let width = parseInt(tab.prerender.width, 10) || 1440;
				let height = parseInt(tab.prerender.height, 10) || 718;

				Emulation.setDeviceMetricsOverride({
					width: width,
					screenWidth: width,
					height: height,
					screenHeight: height,
					deviceScaleFactor: 0,
					mobile: false
				});

				Page.navigate({
					url: tab.prerender.url
				}).then((result) => {
					tab.prerender.navigateError = result.errorText;
					if (tab.prerender.navigateError && tab.prerender.navigateError !== 'net::ERR_ABORTED') {
						util.log(`Navigation error: ${tab.prerender.navigateError}, url=${tab.prerender.url}`);
						Page.stopLoading().catch((err) => {
							util.log(`unable to stop loading page, url=${tab.prerender.url}`, err);
						});
					}

					if (typeof onNavigated === 'function') {
						return Promise.resolve(onNavigated());
					}
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
				tab.prerender.errors.push(UnableToLoadURL);
				finished = true;
				reject();
			});
	});
};



chrome.checkIfPageIsDoneLoading = function (tab) {
	return new Promise((resolve, reject) => {

		if (tab.prerender.receivedRedirect) {
			return resolve(true);
		}

		if (tab.prerender.navigateError) {
			return resolve(true);
		}

		if (!tab.prerender.domContentEventFired) {
			return resolve(false);
		}

		tab.Runtime.evaluate({
			expression: 'window.prerenderReady'
		}).then((result) => {
			let prerenderReady = result && result.result && result.result.value;
			let shouldWaitForPrerenderReady = typeof prerenderReady == 'boolean';
			let waitAfterLastRequest = tab.prerender.waitAfterLastRequest || this.options.waitAfterLastRequest;

			const prerenderReadyDelay = tab.prerender.prerenderReadyDelay || 1000;

			if (prerenderReady && shouldWaitForPrerenderReady && !tab.prerender.firstPrerenderReadyTime) {
				tab.prerender.firstPrerenderReadyTime = new Date().getTime();
			}

			let doneLoading = tab.prerender.numRequestsInFlight <= 0 &&
				tab.prerender.lastRequestReceivedAt < ((new Date()).getTime() - waitAfterLastRequest)

			const timeSpentAfterFirstPrerenderReady = (tab.prerender.firstPrerenderReadyTime && (new Date().getTime() - tab.prerender.firstPrerenderReadyTime)) || 0;

			resolve(
				(!shouldWaitForPrerenderReady && doneLoading) ||
				(shouldWaitForPrerenderReady && prerenderReady && (doneLoading || timeSpentAfterFirstPrerenderReady > prerenderReadyDelay))
			);
		}).catch((err) => {
			util.log('unable to evaluate javascript on the page');
			tab.prerender.statusCode = 504;
			tab.prerender.errors.push(UnableToEvaluateJavascript);
			reject();
		});
	});

};



chrome.executeJavascript = function (tab, javascript) {
	return new Promise((resolve, reject) => {
		tab.Runtime.evaluate({
			expression: javascript
		}).then((result) => {

			//give previous javascript a little time to execute
			setTimeout(() => {

				tab.Runtime.evaluate({
					expression: "(window.prerenderData && typeof window.prerenderData == 'object' && JSON.stringify(window.prerenderData)) || window.prerenderData"
				}).then((result) => {
					try {
						tab.prerender.prerenderData = JSON.parse(result && result.result && result.result.value);
					} catch (e) {
						tab.prerender.prerenderData = result.result.value;
					}
					resolve();
				}).catch((err) => {
					util.log('unable to evaluate javascript on the page', err);
					tab.prerender.statusCode = 504;
					tab.prerender.errors.push(UnableToEvaluateJavascript);
					reject();
				});

			}, 1000);
		}).catch((err) => {
			util.log('unable to evaluate javascript on the page');
			tab.prerender.statusCode = 504;
			tab.prerender.errors.push(UnableToEvaluateJavascript);
			reject();
		});
	});
};

const getHtmlFunction = () => {
  return document.firstElementChild.outerHTML;
}

const getHtmlWithShadowDomFunction = () => {
  const innerText =  document.firstElementChild.getInnerHTML({includeShadowRoots: true});
  const htmlNode = document.firstElementChild;
  const attributeNames = htmlNode.getAttributeNames();
  const attrStringList = attributeNames.map((attributeName) => (`${attributeName}="${htmlNode.getAttribute(attributeName)}"`))

  return `<!DOCTYPE html>
  <html ${attrStringList.join(' ')}>
    ${innerText}
  </html>`;
}

chrome.parseHtmlFromPage = function (tab) {
	return new Promise((resolve, reject) => {

		var parseTimeout = setTimeout(() => {
			util.log('parse html timed out', tab.prerender.url);
			tab.prerender.statusCode = 504;
			tab.prerender.errors.push(ParseHTMLTimedOut);
			reject();
		}, 5000);


		const getHtmlFunctionText = tab.prerender.parseShadowDom
			? getHtmlWithShadowDomFunction.toString()
			: getHtmlFunction.toString();


		tab.Runtime.evaluate({
			expression: `(${getHtmlFunctionText})()` // Call the function
		}).then((resp) => {

			tab.prerender.content = resp.result.value;
			if (tab.prerender.content === undefined) {
				tab.prerender.statusCode = 504;
			}
			return tab.Runtime.evaluate({
				expression: 'document.doctype && JSON.stringify({name: document.doctype.name, systemId: document.doctype.systemId, publicId: document.doctype.publicId})'
			});
		}).then((response) => {

			let doctype = '';
			if (response && response.result && response.result.value) {
				let obj = { name: 'html' };
				try {
					obj = JSON.parse(response.result.value);
				} catch (e) { }

				doctype = "<!DOCTYPE "
					+ obj.name
					+ (obj.publicId ? ' PUBLIC "' + obj.publicId + '"' : '')
					+ (!obj.publicId && obj.systemId ? ' SYSTEM' : '')
					+ (obj.systemId ? ' "' + obj.systemId + '"' : '')
					+ '>'
			}

			tab.prerender.content = doctype + tab.prerender.content;
			clearTimeout(parseTimeout);
			resolve();
		}).catch((err) => {
			util.log('unable to parse HTML', err);
			tab.prerender.statusCode = 504;
			tab.prerender.errors.push(UnableToParseHTML);
			clearTimeout(parseTimeout);
			reject();
		});
	});
};


chrome.captureScreenshot = function (tab, format, fullpage) {
	return new Promise((resolve, reject) => {

		var parseTimeout = setTimeout(() => {
			util.log('capture screenshot timed out for', tab.prerender.url);
			tab.prerender.statusCode = 504;
			tab.prerender.errors.push(CaptureScreenshotTimedOut);
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
				tab.prerender.errors.push(UnableToCaptureScreenshot);
				clearTimeout(parseTimeout);
				reject();
			});
		});

	});
};


chrome.printToPDF = function (tab, options) {
	return new Promise((resolve, reject) => {

		var parseTimeout = setTimeout(() => {
			util.log('print pdf timed out for', tab.prerender.url);
			tab.prerender.statusCode = 504;
			tab.prerender.errors.push(PrintPdfTimedOut);
			reject();
		}, 5000);

		tab.Page.printToPDF(options).then((response) => {
			tab.prerender.content = new Buffer(response.data, 'base64');
			clearTimeout(parseTimeout);
			resolve();
		}).catch((err) => {
			util.log('unable to capture pdf:', err);
			tab.prerender.statusCode = 504;
			tab.prerender.errors.push(UnableToCapturePdf);
			clearTimeout(parseTimeout);
			reject();
		});

	});
};


chrome.getHarFile = function (tab) {
	return new Promise((resolve, reject) => {

		var packageInfo = require('../../package');

		const firstRequest = tab.prerender.pageLoadInfo.entries[tab.prerender.pageLoadInfo.firstRequestId].requestParams;
		const wallTimeMs = firstRequest.wallTime * 1000;
		const startedDateTime = new Date(wallTimeMs).toISOString();
		const onContentLoad = tab.prerender.pageLoadInfo.domContentEventFiredMs - tab.prerender.pageLoadInfo.firstRequestMs;
		const onLoad = tab.prerender.pageLoadInfo.loadEventFiredMs - tab.prerender.pageLoadInfo.firstRequestMs;
		const entries = parseEntries(tab.prerender.pageLoadInfo.entries);

		tab.prerender.content = {
			log: {
				version: '1.2',
				creator: {
					name: 'Prerender HAR Capturer',
					version: packageInfo.version,
					comment: packageInfo.homepage
				},
				pages: [
					{
						id: 'page_1',
						title: tab.prerender.url,
						startedDateTime: startedDateTime,
						pageTimings: {
							onContentLoad: onContentLoad,
							onLoad: onLoad
						}
					}
				],
				entries: entries
			}
		};

		resolve();

	});
};



function parseEntries(entries) {

	let harEntries = [];

	Object.keys(entries).forEach((key) => {

		let entry = entries[key];

		if (!entry.responseParams || !entry.responseFinishedS && !entry.responseFailedS) {
			return null;
		}

		if (!entry.responseParams.response.timing) {
			return null;
		}

		const { request } = entry.requestParams;
		const { response } = entry.responseParams;

		const wallTimeMs = entry.requestParams.wallTime * 1000;
		const startedDateTime = new Date(wallTimeMs).toISOString();
		const httpVersion = response.protocol || 'unknown';
		const { method } = request;
		const loadedUrl = request.url;
		const { status, statusText } = response;
		const headers = parseHeaders(httpVersion, request, response);
		const redirectURL = getHeaderValue(response.headers, 'location', '');
		const queryString = url.parse(request.url, true).query;
		const { time, timings } = computeTimings(entry);

		let serverIPAddress = response.remoteIPAddress;
		if (serverIPAddress) {
			serverIPAddress = serverIPAddress.replace(/^\[(.*)\]$/, '$1');
		}

		const connection = String(response.connectionId);
		const _initiator = entry.requestParams.initiator;
		const { changedPriority } = entry;
		const newPriority = changedPriority && changedPriority.newPriority;
		const _priority = newPriority || request.initialPriority;
		const payload = computePayload(entry, headers);
		const { mimeType } = response;
		const encoding = entry.responseBodyIsBase64 ? 'base64' : undefined;

		harEntries.push({
			pageref: 'page_1',
			startedDateTime,
			time,
			request: {
				method,
				url: loadedUrl,
				httpVersion,
				cookies: [], // TODO
				headers: headers.request.pairs,
				queryString,
				headersSize: headers.request.size,
				bodySize: payload.request.bodySize
				// TODO postData
			},
			response: {
				status,
				statusText,
				httpVersion,
				cookies: [], // TODO
				headers: headers.response.pairs,
				redirectURL,
				headersSize: headers.response.size,
				bodySize: payload.response.bodySize,
				_transferSize: payload.response.transferSize,
				content: {
					size: entry.responseLength,
					mimeType,
					compression: payload.response.compression,
					text: entry.responseBody,
					encoding
				}
			},
			cache: {},
			timings,
			serverIPAddress,
			connection,
			_initiator,
			_priority
		});
	});

	return harEntries;
};


function parseHeaders(httpVersion, request, response) {
	// convert headers from map to pairs
	const requestHeaders = response.requestHeaders || request.headers;
	const responseHeaders = response.headers;
	const headers = {
		request: {
			map: requestHeaders,
			pairs: zipNameValue(requestHeaders),
			size: -1
		},
		response: {
			map: responseHeaders,
			pairs: zipNameValue(responseHeaders),
			size: -1
		}
	};
	// estimate the header size (including HTTP status line) according to the
	// protocol (this information not available due to possible compression in
	// newer versions of HTTP)
	if (httpVersion.match(/^http\/[01].[01]$/)) {
		const requestText = getRawRequest(request, headers.request.pairs);
		const responseText = getRawResponse(response, headers.response.pairs);
		headers.request.size = requestText.length;
		headers.response.size = responseText.length;
	}
	return headers;
}


function computePayload(entry, headers) {
	// From Chrome:
	//  - responseHeaders.size: size of the headers if available (otherwise
	//    -1, e.g., HTTP/2)
	//  - entry.responseLength: actual *decoded* body size
	//  - entry.encodedResponseLength: total on-the-wire data
	//
	// To HAR:
	//  - headersSize: size of the headers if available (otherwise -1, e.g.,
	//    HTTP/2)
	//  - bodySize: *encoded* body size
	//  - _transferSize: total on-the-wire data
	//  - content.size: *decoded* body size
	//  - content.compression: *decoded* body size - *encoded* body size
	let bodySize;
	let compression;
	let transferSize = entry.encodedResponseLength;
	if (headers.response.size === -1) {
		// if the headers size is not available (e.g., newer versions of
		// HTTP) then there is no way (?) to figure out the encoded body
		// size (see #27)
		bodySize = -1;
		compression = undefined;
	} else if (entry.responseFailedS) {
		// for failed requests (`Network.loadingFailed`) the transferSize is
		// just the header size, since that evend does not hold the
		// `encodedDataLength` field, this is performed manually (however this
		// cannot be done for HTTP/2 which is handled by the above if)
		bodySize = 0;
		compression = 0;
		transferSize = headers.response.size;
	} else {
		// otherwise the encoded body size can be obtained as follows
		bodySize = entry.encodedResponseLength - headers.response.size;
		compression = entry.responseLength - bodySize;
	}
	return {
		request: {
			// trivial case for request
			bodySize: parseInt(getHeaderValue(headers.request.map, 'content-length', -1), 10)
		},
		response: {
			bodySize,
			transferSize,
			compression
		}
	};
}


function zipNameValue(map) {
	const pairs = [];

	Object.keys(map).forEach(function (name) {
		const value = map[name];
		const values = Array.isArray(value) ? value : [value];
		for (const value of values) {
			pairs.push({ name, value });
		}
	});
	return pairs;
}

function getRawRequest(request, headerPairs) {
	const { method, url, protocol } = request;
	const lines = [`${method} ${url} ${protocol}`];
	for (const { name, value } of headerPairs) {
		lines.push(`${name}: ${value}`);
	}
	lines.push('', '');
	return lines.join('\r\n');
}

function getRawResponse(response, headerPairs) {
	const { status, statusText, protocol } = response;
	const lines = [`${protocol} ${status} ${statusText}`];
	for (const { name, value } of headerPairs) {
		lines.push(`${name}: ${value}`);
	}
	lines.push('', '');
	return lines.join('\r\n');
}


function getHeaderValue(headers, name, fallback) {
	const pattern = new RegExp(`^${name}$`, 'i');
	const key = Object.keys(headers).find((name) => {
		return name.match(pattern);
	});
	return key === undefined ? fallback : headers[key];
};


function computeTimings(entry) {
	// https://chromium.googlesource.com/chromium/blink.git/+/master/Source/devtools/front_end/sdk/HAREntry.js
	// fetch the original timing object and compute duration
	const timing = entry.responseParams.response.timing;
	const finishedTimestamp = entry.responseFinishedS || entry.responseFailedS;
	const time = toMilliseconds(finishedTimestamp - timing.requestTime);
	// compute individual components
	const blocked = firstNonNegative([
		timing.dnsStart, timing.connectStart, timing.sendStart
	]);
	let dns = -1;
	if (timing.dnsStart >= 0) {
		const start = firstNonNegative([timing.connectStart, timing.sendStart]);
		dns = start - timing.dnsStart;
	}
	let connect = -1;
	if (timing.connectStart >= 0) {
		connect = timing.sendStart - timing.connectStart;
	}
	const send = timing.sendEnd - timing.sendStart;
	const wait = timing.receiveHeadersEnd - timing.sendEnd;
	const receive = time - timing.receiveHeadersEnd;
	let ssl = -1;
	if (timing.sslStart >= 0 && timing.sslEnd >= 0) {
		ssl = timing.sslEnd - timing.sslStart;
	}
	return {
		time,
		timings: { blocked, dns, connect, send, wait, receive, ssl }
	};
};


function toMilliseconds(time) {
	return time === -1 ? -1 : time * 1000;
}

function firstNonNegative(values) {
	const value = values.find((value) => value >= 0);
	return value === undefined ? -1 : value;
}
