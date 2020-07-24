module.exports = {
	beforeExtractHTML: (req, res, next) => {
        const tab = req.prerender.tab;

        tab.Runtime.evaluate({
            expression: `for (styleSheet of document.styleSheets) {
                if (!styleSheet.href && styleSheet.ownerNode) {
                    if (styleSheet.ownerNode.innerText === '') {
                        const cssText = [].slice.call(styleSheet.cssRules)
                                .reduce(function (prev, cssRule) {
                                    return prev + cssRule.cssText;
                                }, '');
                        styleSheet.ownerNode.innerHTML = cssText;
                    }
                }
            }`
        });

		next();
	}
};