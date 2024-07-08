module.exports = {
  pageLoaded: (req, res, next) => {
    if (
      !req.prerender.content ||
      req.prerender.renderType != 'html' ||
      !req.prerender.renderId ||
      !req.prerender.start
    ) {
      return next();
    }

    const content = req.prerender.content.toString();
    const headClosingIndex = content.indexOf('</head>');

    if (headClosingIndex > -1) {
      const metaTags = `<meta rel="x-prerender-render-id" content="${req.prerender.renderId}" />
			<meta rel="x-prerender-render-at" content="${req.prerender.start.toISOString()}" />`;

      req.prerender.content =
        content.slice(0, headClosingIndex) +
        metaTags +
        content.slice(headClosingIndex);
    }
    next();
  },
};
