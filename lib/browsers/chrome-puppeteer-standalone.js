const os = require('os');
const fs = require('fs');
const puppeteer = require('puppeteer');
const PuppeteerChrome = require('./chrome-puppeteer');

const util = require('../util.js');

const trace = util.trace;

class PuppeteerChromeStandalone extends PuppeteerChrome {
	constructor() {
		super();
		this.name = 'Puppeteer Standalone';
	}

	getChromeLocation() {
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

		throw new Error(`Unknown platform ${platform}`);
	};

	async spawn(options) {
		trace("SPAWN", options);
		this.options = options;
		const location = this.getChromeLocation();
		const launchOptions = {
			args: ['--disable-gpu', '--hide-scrollbars'],
		};
		if (fs.existsSync(location)) {
			launchOptions.executablePath = location;
		}
		this.browser = await puppeteer.launch(launchOptions);

		this.originalUserAgent = await this.browser.userAgent();
		this.version = await this.browser.version();
	};

	async onClose(callback) {
		trace("ONCLOSE");
		this.browser.on('disconnected', callback);
	};

	isLocalBrowser() {
		return true;
	}

	kill() {
		trace("KILL");
		if (this.browser) {
			this.browser.close();
			// this.browser.disconnect(); // .close() is async and disconnects too. Using both may lead to errors
		}
	};

	killForRestart() {
		trace("KILL FOR RESTART");
		this.kill();
	};

	async connect () {
		trace("CONNECT SKIPPED");
	};

	async createNewPage() {
		const browserContext = await this.browser.createIncognitoBrowserContext();
		const page = await browserContext.newPage();
		return { page, browserContext };
	}
};

module.exports = PuppeteerChromeStandalone;
