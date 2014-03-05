module.exports = {
    postRender: function(context, next) {
        var content = context.documentHTML;
    	if(!content) {
    		return next();
    	}

        var matches = content.toString().match(/<script(?:.*?)>(?:[\S\s]*?)<\/script>/gi);
        for (var i = 0; matches && i < matches.length; i++) {
            content = content.toString().replace(matches[i], '');
        }

        context.setContent(content);

        next();
    }

};
