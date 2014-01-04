module.exports = {
    beforeSend: function(phantom, item, next) {
    	if(!item.documentHTML) {
    		return next();
    	}

        var matches = item.documentHTML.toString().match(/<script(?:.*?)>(?:[\S\s]*?)<\/script>/gi);
        for (var i = 0; matches && i < matches.length; i++) {
            item.documentHTML = item.documentHTML.toString().replace(matches[i], '');
        }

        next();
    }
};
