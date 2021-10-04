const puppeteer = require('puppeteer-core');
const PuppeteerChrome = require('./chrome-puppeteer');

const util = require('../util.js');

const trace = util.trace;


const connectionInfo = (browser) => browser.wsEndpoint();
// const connectionInfo = (browser) => browser?._connection?._transport?._ws;


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
		
		try {
			const serverlessCluster = this.options.serverlessCluster;
			const browser = await puppeteer.connect({ browserWSEndpoint: serverlessCluster});
			trace('CONNECTION', connectionInfo(browser));
			// this.browser = browser;
			this.originalUserAgent = await browser.userAgent();
			this.version = await browser.version();

			trace("CONNECTED TO BROWSER");
			const browserContext = await browser.createIncognitoBrowserContext();
			const page = await browserContext.newPage();
			return { page, browserContext };

		} catch (e) {
			console.log('Failed to connect to Serverless cluster', e.message);
			throw(e);
		}
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
