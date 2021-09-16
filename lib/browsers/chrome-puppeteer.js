const util = require('../util.js');

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

class PuppeteerChrome {

	constructor() {
		this.name = 'Puppeteer';
	}

	isLocalBrowser() {
		throw new Error('Not implemented');
	}

	async spawn() {
		throw new Error('Not implemented');
	}

	async onClose () {
		throw new Error('Not implemented');
	};

	async kill () {
		throw new Error('Not implemented');
	};

	async killForRestart () {
		throw new Error('Not implemented');
	};

	async connect () {
		throw new Error('Not implemented');
	};

	async createNewPage(options) {
		throw new Error('Not implemented');
	}

	async openTab (options) {
		const { page, browserContext } = await this.createNewPage(options);
		page.prerender = options;
		page.prerender.requests = {};
		page.prerender.numRequestsInFlight = 0;
		page.prerender.pageContext = browserContext;
	
		// Slow down for testing
		// page.emulateNetworkConditions({upload: 0.5*1024, download: 0.5*1024, latency: 0});
	
		await this.setUpEvents(page);
		return page;
	};

	async closeTab (tab) {
		trace("CLOSE TAB");
		await tab.prerender.pageContext.close();
	};

	async setUpEvents (tab) {
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
	
		page.setViewport({
			width,
			height,
			deviceScaleFactor: 0, // 0 means disable the override
			isMobile: false,
	
		})
	
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
				util.log(`Initial request to ${url}`);
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
				//during a redirect, we don't get the responseReceived event for the original request,
				//so lets decrement the number of requests in flight here.
				//the original requestId is also reused for the redirected request
				tab.prerender.numRequestsInFlight--;
	
				const redirectEntry = tab.prerender.pageLoadInfo.entries[requestId];
				redirectEntry.response = redirectRequest.response();
				redirectEntry.responseFinishedS = timestamp;
	
				if (tab.prerender.initialRequestId === requestId && !tab.prerender.followRedirects && !this.options.followRedirects) {
					util.log(`Initial request redirected from ${request.url()} with status code ${status}`);
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
			if (entry) {
				entry.response = response;
			}

			if (entry && response.ok()) { // Response ok(): for example redirects do not have a response
				responseBufferLength(response)
					.then((size) => { entry.responseLength += size })
					.catch((err) => { console.log("No buffer error", err) });
			}
	
			if (requestId === tab.prerender.initialRequestId && !tab.prerender.receivedRedirect) {
				util.log(`Initial response from ${response.request().url()} with status code ${response.status()}`);
				const status = response.status();
				const headers = response.headers();
	
				tab.prerender.statusCode = status;
				tab.prerender.headers = headers;
	
				//if we get a 304 from the server, turn it into a 200 on our end
				if (tab.prerender.statusCode == 304) tab.prerender.statusCode = 200;
			}

			if (response.request().resourceType() === 'eventsource') {
				tab.prerender.numRequestsInFlight--;
				tab.prerender.lastRequestReceivedAt = new Date().getTime();
				if (tab.prerender.logRequests || this.options.logRequests) util.log('-', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
				delete tab.prerender.requests[params.requestId];
			}
		});
	
		page.on('requestfinished', (request) => {
			const requestId = getRequestId(request);
			const timestamp = new Date().getTime();
			// trace('requestfinished I', requestId);
			// trace("EVENT REQUEST FINISHED", requestId);
			if (tab.prerender.initialRequestId === requestId) {
				util.log(`Initial request finished ${request}`);
			}
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
			// trace('requestfailed II ', requestId);
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

	loadUrlThenWaitForPageLoadEvent(tab, url) {
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

	checkIfPageIsDoneLoading(tab) {
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

	parseHtmlFromPage(tab) {
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
	
	stopLoading(page) {
		page.loadingStopped = true;
		return page._client.send('Page.stopLoading');
	}
	
	bypassServiceWorker(page) {
		let bypassServiceWorker = !(this.options.enableServiceWorker == true || this.options.enableServiceWorker == 'true');
		if (typeof page.prerender.enableServiceWorker !== 'undefined') {
			bypassServiceWorker = !page.prerender.enableServiceWorker;
		}
		return page._client.send('Network.setBypassServiceWorker', { bypass: bypassServiceWorker });
	}
	
	setOverrideCertificateErrors(page) {
		return page._client.send('Security.setIgnoreCertificateErrors', { ignore: true });
	}
}

module.exports = PuppeteerChrome;
