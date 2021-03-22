const puppeteer = require('puppeteer');

function Chrome() {
	this.name = 'Chrome';
}

/** @typedef {puppeteer.LaunchOptions & puppeteer.BrowserLaunchArgumentOptions & puppeteer.BrowserConnectOptions} PuppeteerOptions */

Chrome.prototype.spawn = async function spawn (options) {
	this.options = options;
	/** @type {PuppeteerOptions} */
	let puppeteerOpts = {
		headless: options.headless || true,
		args: options.chromeFlags || [
			'--disable-gpu',
			'--hide-scrollbars',
		],
	};
	if (options.chromeLocation) {
		puppeteerOpts.executablePath = options.chromeLocation;
	}
	this.browser = (options.browserWSEndpoint) ? await puppeteer.connect({browserWSEndpoint: options.browserWSEndpoint}) : await puppeteer.launch(puppeteerOpts);
	this.version = await this.browser.version();
	this.originalUserAgent = await this.browser.userAgent();
}

Chrome.prototype.onClose = function onClose (callback) {
	this.browser.on('close', callback);
}

Chrome.prototype.kill = function kill () {
	return this.browser.close();
}

Chrome.prototype.openTab = async function openTab(options) {
	const context = await this.browser.createIncognitoBrowserContext();

	const tab = await context.newPage();
	tab.prerender = options;
	tab.prerender.requests = {};
	tab.prerender.numRequestsInFlight = 0;
	await this.setupEvents(tab);
	return tab;
}

/**
 * 
 * @param {puppeteer.Page} tab 
 */
Chrome.prototype.setupEvents = async function setupEvents(tab) {
	/** @type {puppeteer.CDPSession} */
	let session;
	try {
		session = tab._client;

		await Promise.all(['Page', 'DOM', 'Security', 'Console', 'Log'].map(m => session.send(m.concat('.enable'))));

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

		session.on('Page.domContentEventFired', ({timestamp}) => {
			tab.prerender.domContentEventFired = true;
			tab.prerender.pageLoadInfo.domContentEventFiredMs = timestamp * 1000;
		});

		session.on('Page.loadEventFired', ({timestamp}) => {
			tab.prerender.pageLoadInfo.loadEventFiredMs = timestamp * 1000;
		});

		session.on('Page.javascriptDialogOpening', () => {
			setTimeout(() => {
				session.send('Page.handleJavaScriptDialog', {accept: true});
			}, 1000);
		});

		session.on('Security.certificateError', async ({eventId}) => {
			await session.send('Security.handleCertificateError', {
				eventId,
				action: 'continue'
			});
		});

		await session.send('Security.setOverrideCertificateErrors', {override: true});

		await session.send('Network.setUserAgentOverride', {
			userAgent: tab.prerender.userAgent || this.options.userAgent || this.originalUserAgent + ' Prerender (+https://github.com/prerender/prerender)'
		});

		let bypassServiceWorker = !(this.options.enableServiceWorker == true || this.options.enableServiceWorker == 'true');

		if (typeof tab.prerender.enableServiceWorker !== 'undefined') {
			bypassServiceWorker = !tab.prerender.enableServiceWorker;
		}

		await session.send('Network.setBypassServiceWorker', {bypass: bypassServiceWorker});

		session.on('Network.requestWillBeSent', async (params) => {
			tab.prerender.numRequestsInFlight++;
			tab.prerender.requests[params.requestId] = params.request.url;
			if (tab.prerender.logRequests || this.options.logRequests) util.log('+', tab.prerender.numRequestsInFlight, params.request.url);

			if (!tab.prerender.initialRequestId) {
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
					tab.prerender.receivedRedirect = true; //initial response of a 301 gets modified so we need to capture that we saw a redirect here
					tab.prerender.lastRequestReceivedAt = new Date().getTime();
					tab.prerender.statusCode = params.redirectResponse.status;
					tab.prerender.headers = params.redirectResponse.headers;
					tab.prerender.content = params.redirectResponse.statusText;

					await session.send('Page.stopLoading');
				}
			}
		});

		session.on('Network.dataReceived', ({requestId, dataLength}) => {
			let entry = tab.prerender.pageLoadInfo.entries[requestId];
			if (!entry) {
				return;
			}
			entry.responseLength += dataLength;
		});

		session.on('Network.responseReceived', (params) => {
			let entry = tab.prerender.pageLoadInfo.entries[params.requestId];
			if (entry) {
				entry.responseParams = params;
			}

			if (params.requestId == tab.prerender.initialRequestId && !tab.prerender.receivedRedirect) {

				tab.prerender.statusCode = params.response.status;
				tab.prerender.headers = params.response.headers;

				//if we get a 304 from the server, turn it into a 200 on our end
				if(tab.prerender.statusCode == 304) tab.prerender.statusCode = 200;
			}
		});

		session.on('Network.resourceChangedPriority', ({requestId, newPriority}) => {
			let entry = tab.prerender.pageLoadInfo.entries[requestId];
			if (!entry) {
				return;
			}
			entry.newPriority = newPriority;
		});

		session.on('Network.loadingFinished', ({requestId, timestamp, encodedDataLength}) => {
			if(tab.prerender.requests[requestId]) {
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

		session.on('Network.loadingFailed', (params) => {
			if(tab.prerender.requests[params.requestId]) {
				tab.prerender.numRequestsInFlight--;
				if (tab.prerender.logRequests || this.options.logRequests) util.log('-', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
				delete tab.prerender.requests[params.requestId];

				let entry = tab.prerender.pageLoadInfo.entries[params.requestId];
				if (entry) {
					entry.responseFailedS = params.timestamp;
				}
			}
		});

		session.on('Console.messageAdded', (params) => {
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

		session.on('Log.entryAdded', (params) => {
			tab.prerender.pageLoadInfo.logEntries.push(params.entry);
			if (tab.prerender.logRequests || this.options.logRequests) util.log(params.entry);
		});
	} catch (e) {}
}
/**
 * 
 * @param {puppeteer.Page} tab 
 * @param {string} url 
 */
Chrome.prototype.loadUrlThenWaitForPageLoadEvent = async function loadUrlThenWaitForPageLoadEvent(tab, url) {
	tab.prerender.url = url;
	const pageLoadTimeout = tab.prerender.pageLoadTimeout || this.options.pageLoadTimeout;

	await tab.evaluateOnNewDocument('if (window.customElements) customElements.forcePolyfill = true');
	await tab.evaluateOnNewDocument('ShadyDOM = {force: true}');
	await tab.evaluateOnNewDocument('ShadyCSS = {shimcssproperties: true}');
	
	const width = parseInt(tab.prerender.width, 10) || 1440;
	const height = parseInt(tab.prerender.height, 10) || 718;
	await tab.setViewport({
		width,
		height,
		deviceScaleFactor: 0,
		isMobile: false,
	});

	const res = await tab.goto(url, {
		waitUntil: 'domcontentloaded',
		timeout: pageLoadTimeout
	});
	
}
/**
 * 
 * @param {puppeteer.Page} tab 
 */
Chrome.prototype.closeTab = function closeTab(tab) {
	return tab.close();
}

/**
 * 
 * @param {puppeteer.Page} tab 
 */
Chrome.prototype.executeJavascript = async function executeJavascript(tab, javascript) {
	await tab.evaluate(javascript);
	const result = await tab.evaluate("(window.prerenderData && typeof window.prerenderData == 'object' && JSON.stringify(window.prerenderData)) || window.prerenderData");
	try {
		tab.prerender.prerenderData = JSON.parse(result);
	} catch (error) {
		tab.prerender.prerenderData = result;
	}
}

/**
 * 
 * @param {puppeteer.Page} tab 
 */
Chrome.prototype.parseHtmlFromPage = async function parseHtmlFromPage(tab) {
	const result = await tab.evaluate('document.firstElementChild.outerHTML');
	tab.prerender.content = result;
	const resp = await tab.evaluate('document.doctype && JSON.stringify({name: document.doctype.name, systemId: document.doctype.systemId, publicId: document.doctype.publicId}) || undefined');
	let doctype = '';
	let obj = {name: 'html'};
	try {
		obj = JSON.parse(resp);
	} catch (e) {}
	doctype = `<!DOCTYPE ${obj.name}${obj.publicId ? ` PUBLIC "${obj.publicId}"`: ''}${!obj.publicId && obj.systemId ? ' SYSTEM': ''}${obj.systemId ? ` "${obj.systemId}"`: ''}>`;
	tab.prerender.content = doctype + tab.prerender.content;
}

/**
 * @param {puppeteer.Page} tab
 */
Chrome.prototype.captureScreenshot = async function captureScreenshot(tab, format, fullPage) {
	const viewport = tab.viewport();
	let viewportClip = {
		x: 0, y: 0,
		width: viewport.width,
		height: viewport.height
	};
	const image = await tab.screenshot({
		clip: viewportClip,
		fullPage,
		type: format,
		encoding: 'base64'
	});
	return image;
}

/**
 * @param {puppeteer.Page} tab
 */
 Chrome.prototype.printToPDF = async function printToPDF(tab, options) {

	const pdf = await tab.pdf(options);
	return pdf;
}

exports = module.exports = new Chrome;