const blockedDomains = [
	/google-analytics\.com$/,
	/api\.mixpanel\.com$/,
	/fonts\.googleapis\.com$/,
	/stats\.g\.doubleclick\.net$/,
	/mc\.yandex\.ru$/,
	/use\.typekit\.net$/,
	/beacon\.tapfiliate\.com$/,
	/js-agent\.newrelic\.com$/,
	/api\.segment\.io$/,
	/woopra\.com$/,
	/static\.olark\.com$/,
	/static\.getclicky\.com$/,
	/fast\.fonts\.com$/,
	/cdn\.heapanalytics\.com$/,
	/googleads\.g\.doubleclick\.net$/,
	/pagead2\.googlesyndication\.com$/,
	/hn\.inspectlet\.com$/,
	/tpc\.googlesyndication\.com$/,
	/partner\.googleadservices\.com$/,
];
const blockedExtensions = [
	/\.ttf$/,
	/\.eot$/,
	/\.otf$/,
	/\.woff$/,
	/\.png$/,
	/\.gif$/,
	/\.tiff$/,
	/\.pdf$/,
	/\.jpg$/,
	/\.jpeg$/,
	/\.ico$/,
	/\.svg$/,
];
const blockedURLFragments = [
	/navilytics\.com\/nls_ajax\.php/,
	/log\.optimizely\.com\/event/,
	/fullstory\.com\/rec/,
	/youtube\.com\/embed$/,
];

const shouldBlockRequest = (request) => {
	try {
		const url = new URL(request.url());
		return blockedDomains.some( (domainRegex) => domainRegex.test(url.hostname))
			|| blockedExtensions.some( (extensionRegex) => extensionRegex.test(url.pathname))
			|| blockedURLFragments.some( (fragmentRegex) => fragmentRegex.test(url));
	} catch (e) {
		// Invalid url, block it. It shouldn't even happen here
		return true;
	}
};

module.exports = {
	name: 'blockResource',
	tabCreated: (req, _res, next) => {
		// Note that there should be only one plugin that handles the request interception
		req.prerender.tab.setRequestInterception(true);

		req.prerender.tab.on('request', (request) => {
			try {
				const shouldBlock = shouldBlockRequest(request);
				if (shouldBlock) {
					request.abort('aborted');
				} else {
					request.continue();
				}
			} catch (e) {
				console.log(e)
			}

		});
		next();
	},
	shouldBlockRequest // Exported for the tests
};
