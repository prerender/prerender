const blockedResources = [
	"google-analytics.com",
	"api.mixpanel.com",
	"fonts.googleapis.com",
	"stats.g.doubleclick.net",
	"mc.yandex.ru",
	"use.typekit.net",
	"beacon.tapfiliate.com",
	"js-agent.newrelic.com",
	"api.segment.io",
	"woopra.com",
	"static.olark.com",
	"static.getclicky.com",
	"fast.fonts.com",
	"youtube.com/embed",
	"cdn.heapanalytics.com",
	"googleads.g.doubleclick.net",
	"pagead2.googlesyndication.com",
	"fullstory.com/rec",
	"navilytics.com/nls_ajax.php",
	"log.optimizely.com/event",
	"hn.inspectlet.com",
	"tpc.googlesyndication.com",
	"partner.googleadservices.com",
	".ttf",
	".eot",
	".otf",
	".woff",
	".png",
	".gif",
	".tiff",
	".pdf",
	".jpg",
	".jpeg",
	".ico",
	".svg",
	".webp"
];

module.exports = {
	tabCreated: async (req, res, next) => {

		if (req.prerender.product === 'firefox') {
			return next();
		}

		await req.prerender.tab.setRequestInterception(true);

		req.prerender.tab.on('request', interceptedRequest => {
			let shouldBlock = false;
			blockedResources.forEach((substring) => {
				if (interceptedRequest.url().indexOf(substring) >= 0) {
					shouldBlock = true;
				}
			});


			if (shouldBlock) {
				interceptedRequest.abort();
			} else {
				interceptedRequest.continue();
			}
		});
		next();
	}
};