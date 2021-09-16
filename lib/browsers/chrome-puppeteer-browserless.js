const puppeteer = require('puppeteer');
const PuppeteerChrome = require('./chrome-puppeteer');

const util = require('../util.js');

const trace = util.trace;

class PuppeteerChromeBrowserless extends PuppeteerChrome {
	constructor() {
		super();
		this.name = 'Puppeteer Browserless';
	}

	async spawn(options) {
		trace("SPAWN", options);
		this.options = options;
	};


	async createNewPage() {
		trace('OPENTAB');
		
		const serverlessCluster = this.options.serverlessCluster;
		const browser = await puppeteer.connect({ browserWSEndpoint: serverlessCluster});
		// this.browser = browser;
		this.originalUserAgent = await browser.userAgent();
		this.version = await browser.version();

		trace("CONNECTED TO BROWSER");
		const browserContext = await browser.createIncognitoBrowserContext();
		const page = await browserContext.newPage();
		return { page, browserContext };
	}

	async onClose () {
		trace("ONCLOSE");
	}

	isLocalBrowser() {
		return false;
	}

	kill() {
		trace("KILL");
	};

	killForRestart () {
		trace("KILL FOR RESTART");
		// in browserless mode we don't detach
	};

	async connect () {
		trace("CONNECT SKIPPED");
	};
};

module.exports = PuppeteerChromeBrowserless;
