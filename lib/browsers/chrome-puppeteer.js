const util = require('../util.js');

const ChromeConnectionClosed = 'ChromeConnectionClosed';
const UnableToLoadURL = 'UnableToLoadURL';
const InvalidURL = 'InvalidURL';
const UnableToEvaluateJavascript = 'UnableToEvaluateJavascript';
const ParseHTMLTimedOut = 'ParseHTMLTimedOut';
const UnableToParseHTML = 'UnableToParseHTML';

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

class TimeoutError extends Error {}

const withTimeout = (f, timeout) => {
	return new Promise( (resolve, reject) => {
		let timedOut = false;
		const timeoutTimer = setTimeout(() => {
			timedOut = true;
			reject(new TimeoutError('Operation timed out'));
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

	async openTab(options) {
		const { page, browserContext } = await this.createNewPage(options);
		page.prerender = options;
		page.prerender.stopped = false;
		page.prerender.finished = false;
		page.prerender.errors = [];
		page.prerender.requests = {};
		page.prerender.requestsEvents = {};
		page.prerender.numRequestsInFlight = 0;
		page.prerender.pageContext = browserContext;

		// Slow down for testing
		// page.emulateNetworkConditions({upload: 0.5*1024, download: 0.5*1024, latency: 0});

		await this.setUpEvents(page);
		return page;
	};

	async closeTab (tab) {
		util.trace("CLOSE TAB");
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

		await page.setCacheEnabled(false);

		// set overrides
		await this.setOverrideCertificateErrors(page);

		const userAgent = (
			tab.prerender.userAgent ||
			`${this.originalUserAgent} Prerender (+https://github.com/prerender/prerender)`
		);
		await page.setUserAgent(userAgent);

		let width = parseInt(tab.prerender.width, 10) || 1440;
		let height = parseInt(tab.prerender.height, 10) || 718;

		page.setViewport({
			width,
			height,
			deviceScaleFactor: 0, // 0 means disable the override
			isMobile: false,

		})

		await this.bypassServiceWorker(page);

		const addRequestEvent = (requestId, eventName, event) => {
			let requestsEvents = tab.prerender.requestsEvents[requestId];
			if (!requestsEvents) {
				tab.prerender.requestsEvents[requestId] = requestsEvents = [];
			}
			requestsEvents.push({eventName, event});
		}

		const replayEvents = (requestId) => {
			let requestsEvents = tab.prerender.requestsEvents[requestId];
			if (!requestsEvents) {
				return;
			}
			requestsEvents.forEach((event) => {
				switch(event.eventName) {
					case 'response':
						onResponse(event.event);
						break;
					case 'requestfinished':
						onRequestFinished(event.event);
						break;
					case 'requestfailed':
						onRequestFailed(event.event);
						break;
					default: util.log(`Unknown event ${event.eventName}`);
				}
			});
			delete tab.prerender.requestsEvents[requestId];
		}

		const onRequest = async (request) => {
			const requestId = getRequestId(request);
			const timestamp = new Date().getTime();
			const url = request.url();
			util.trace('request', requestId, url);

			tab.prerender.numRequestsInFlight++;
			if (tab.prerender.requests[requestId]) {
				util.trace('DUPLICATED ID');
			}
			tab.prerender.requests[requestId] = url;
			if (tab.prerender.logRequests) util.log('+', tab.prerender.numRequestsInFlight, requestId, url);

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

				const redirectEntry = tab.prerender.pageLoadInfo.entries[requestId];
				redirectEntry.response = redirectRequest.response();
				redirectEntry.responseFinishedS = timestamp;

				if (tab.prerender.initialRequestId === requestId && !tab.prerender.followRedirects) {
					const { status, headers, statusText } = getRedirectInfoFromRequest(request);
					util.log(`Initial request redirected from ${request.url()} (${status})`);
					tab.prerender.receivedRedirect = true; //initial response of a 301 gets modified so we need to capture that we saw a redirect here
					tab.prerender.lastRequestReceivedAt = timestamp;
					tab.prerender.statusCode = status;
					tab.prerender.headers = headers;
					tab.prerender.content = statusText;

					await this.stopLoading(tab);
				}
			}

			replayEvents(requestId);
		}

		const onResponse = (response) => {
			const requestId = getRequestId(response.request());
			util.trace('response', requestId);

			const entry = tab.prerender.pageLoadInfo.entries[requestId];

			if (!entry) {
				addRequestEvent(requestId, 'response', response);
				return;
			}

			if (entry) {
				entry.response = response;
			}

			if (entry && response.ok()) { // Response ok(): for example redirects do not have a response
				responseBufferLength(response)
					.then((size) => { entry.responseLength += size })
					.catch((err) => { console.log("No buffer error", err) });
			}

			if (requestId === tab.prerender.initialRequestId && !tab.prerender.receivedRedirect) {
				util.log(`Initial response from ${response.request().url()} (${response.status()})`);
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
				if (tab.prerender.logRequests) util.log('-', tab.prerender.numRequestsInFlight, requestId, response.request().url());
				delete tab.prerender.requests[requestId];
			}
		}

		const onRequestFinished = (request) => {
			const requestId = getRequestId(request);
			util.trace('requestfinished', requestId);

			if (!tab.prerender.requests[requestId]) {
				addRequestEvent(requestId, 'requestfinished', request);
				return
			}

			const statusCode = request.response().status();
			const timestamp = new Date().getTime();
			// util.trace("EVENT REQUEST FINISHED", requestId);
			if (tab.prerender.initialRequestId === requestId) {
				util.log(`Initial request finished ${requestId} - ${request.url()} (${statusCode})`);
			}

			tab.prerender.numRequestsInFlight--;
			tab.prerender.lastRequestReceivedAt = timestamp;

			if (tab.prerender.logRequests) util.log(`- ${tab.prerender.numRequestsInFlight} ${requestId} ${tab.prerender.requests[requestId]} (${statusCode})`);

			delete tab.prerender.requests[requestId];

			let entry = tab.prerender.pageLoadInfo.entries[requestId];
			if (!entry) {
				return;
			}
			entry.responseFinishedS = timestamp;
		}

		const onRequestFailed = (request) => {
			const requestId = getRequestId(request);
			util.trace('requestfailed', requestId);
			if (!tab.prerender.requests[requestId]) {
				addRequestEvent(requestId, 'requestfailed', request);
				return;
			}

			const statusCode = request.response().status();
			const timestamp = new Date().getTime();
			const failureText = request.failure().errorText;

			if (tab.prerender.initialRequestId === requestId) {
				util.log(`Initial request failed ${requestId} - ${request.url()} (${failureText}) (${statusCode})`);
			}

			tab.prerender.numRequestsInFlight--;
			if (tab.prerender.logRequests) util.log(`- ${tab.prerender.numRequestsInFlight} ${requestId} ${tab.prerender.requests[requestId]} (${failureText}) (${statusCode})`);
			delete tab.prerender.requests[requestId];

			let entry = tab.prerender.pageLoadInfo.entries[requestId];
			if (entry) {
				entry.responseFailedS = timestamp;
			}
		}

		// set up handlers
		page.on('domcontentloaded', () => {
			util.trace("EVENT DOMCONTENTLOADED");
			const timestamp = new Date().getTime();
			util.trace('domcontentloaded timestamp', timestamp)
			tab.prerender.domContentEventFired = true;
			tab.prerender.pageLoadInfo.domContentEventFiredMs = timestamp * 1000;
		});

		page.on('load', () => {
			util.trace("EVENT LOAD");
			const timestamp = new Date().getTime();
			util.trace('load', timestamp);
			tab.prerender.pageLoadInfo.loadEventFiredMs = timestamp * 1000;
		});

		page.on('dialog', async (dialog) => {
			const timestamp = new Date().getTime();
			util.trace('dialog', timestamp);
			setTimeout(() => {
				dialog.accept();
			}, 1000);
		});

		page.on('request', onRequest);

		page.on('response', onResponse);

		page.on('requestfinished', onRequestFinished);

		page.on('requestfailed', onRequestFailed);

		// <del>Console is deprecated, kept for backwards compatibility</del>
		// It's still in use and can't get console-log from Log.entryAdded event
		page.on('console', (msg) => {
			if (tab.prerender.captureConsoleLog) {

				tab.prerender.pageLoadInfo.logEntries.push({
					text: msg.text(),
					level: msg.type(),
					lineNumber: msg.location().lineNumber,
					url: msg.location().url,
					timestamp: new Date().getTime(),
				});
			}

			if (tab.prerender.logRequests) {
				util.log('level:', msg.type(), 'text:', msg.text(), 'url:', msg.location().url, 'line:', msg.location().lineNumber, 'column:', msg.location().columnNumber);
			}
		});

		return tab;
	};

	async loadUrlThenWaitForPageLoadEvent(tab, url) {
		util.trace('loadUrlThenWaitForPageLoadEvent', url);
		try {
			return await withTimeout(() => this._loadUrlThenWaitForPageLoadEvent(tab, url), tab.prerender.pageLoadTimeout);
		} catch (e) {
			if (e instanceof TimeoutError) {
				if (!tab.prerender.finished) {
					tab.prerender.finished = true;
					util.log('page timed out', tab.prerender.url);

					const timeoutStatusCode = tab.prerender.timeoutStatusCode;
					if (timeoutStatusCode) {
						tab.prerender.statusCode = timeoutStatusCode;
					}
				}
				return;
			}
			throw e;
		}
	};

	async _loadUrlThenWaitForPageLoadEvent(tab, url) {
		tab.prerender.url = url;

		try {
			let pageDoneCheckInterval = tab.prerender.pageDoneCheckInterval;

			tab.evaluateOnNewDocument( () => {
				if (window.customElements) customElements.forcePolyfill = true;
			} );
			tab.evaluateOnNewDocument( () => {
				ShadyDOM = {force: true};
			} );
			tab.evaluateOnNewDocument( () => {
				ShadyCSS = {shimcssproperties: true};
			} );
			await tab.goto(tab.prerender.url, { timeout: tab.prerender.pageLoadTimeout });
			await this._waitForPageLoadEvent(tab, pageDoneCheckInterval);

		} catch (err) {
			if (tab.prerender.stopped) {
				// tab stopped because of redirect
				return;
			}
			util.log('unable to load URL', err);
			tab.prerender.errors.push(UnableToLoadURL);
			tab.prerender.statusCode = 504;
			throw Error(`unable to load URL ${err}`);
		} finally {
			tab.prerender.finished = true;
		};
	}

	async _waitForPageLoadEvent(tab, pageDoneCheckInterval) {
		for(;;) {
			await tab.waitForTimeout(pageDoneCheckInterval);
			if (tab.prerender.finished) {
				return;
			}
			const done = await this._checkIfDone(tab);
			if (done) {
				return;
			}
		}
	}

	async _checkIfDone(tab) {
		util.trace('CHECK IF DONE', tab.prerender.url);

		if ((tab.prerender.renderType === 'jpeg' || tab.prerender.renderType === 'png') && tab.prerender.fullpage) {
			tab.evaluate( () => {
				window.scrollBy(0, window.innerHeight);
			});
		}

		try {
			const doneLoading = await this._checkIfPageIsDoneLoading(tab)
			if (doneLoading) {

				if ((tab.prerender.renderType === 'jpeg' || tab.prerender.renderType === 'png') && tab.prerender.fullpage) {
					tab.evaluate( () => {
						window.scrollTo(0, 0);
					});
				}

				await this.stopLoading(tab);
				return true;
			} else {
				return false;
			}

		} catch (e) {
			util.log('checkIfDone: Chrome connection closed during request', e);
			tab.prerender.errors.push(ChromeConnectionClosed);
			tab.prerender.statusCode = 504;
			throw e;
		}
	}

	async _checkIfPageIsDoneLoading(tab) {
		util.trace("CHECK IF PAGE DONE LOADING", tab.prerender.numRequestsInFlight, tab.prerender.requests);

		if (tab.prerender.receivedRedirect) {
			return true;
		}

		if (!tab.prerender.domContentEventFired) {
			return false;
		}

		try {

			const prerenderReady = await tab.evaluate(() => {
				return window.prerenderReady;
			});
			const shouldWaitForPrerenderReady = typeof prerenderReady == 'boolean';
			const waitAfterLastRequest = tab.prerender.waitAfterLastRequest;

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
			util.trace("checkIfPageDoneLoading ready", ready);
			return ready;
		} catch(err) {
			util.log('checkIfPageIsDoneLoading: unable to evaluate javascript on the page', err);
			tab.prerender.errors.push(UnableToEvaluateJavascript);
			tab.prerender.statusCode = 504;
			throw err;
		};
	};

	parseHtmlFromPage(tab) {
		util.trace("PARSE HTML FROM PAGE");
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
				tab.prerender.errors.push(UnableToParseHTML);
				tab.prerender.statusCode = 504;
				throw err;
			}

		}, 5000).catch((e) => {
			if (e instanceof TimeoutError) {
				util.log(`Parse html timed out ${tab.prerender.url}`, e);
				tab.prerender.errors.push(ParseHTMLTimedOut);
				tab.prerender.statusCode = 504;
			}
			throw e;
		});
	};

	stopLoading(tab) {
		tab.prerender.stopped = true;
		return tab._client.send('Page.stopLoading');
	}

	bypassServiceWorker(tab) {
		let bypassServiceWorker = !(tab.prerender.enableServiceWorker == true || tab.prerender.enableServiceWorker == 'true');
		if (typeof tab.prerender.enableServiceWorker !== 'undefined') {
			bypassServiceWorker = !tab.prerender.enableServiceWorker;
		}
		return tab._client.send('Network.setBypassServiceWorker', { bypass: bypassServiceWorker });
	}

	setOverrideCertificateErrors(tab) {
		return tab._client.send('Security.setIgnoreCertificateErrors', { ignore: true });
	}
}

module.exports = PuppeteerChrome;
