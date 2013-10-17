module.exports = {
    afterPhantomRequest: function(req, res, next) {
        var statusMatch = /<meta name="prerender-status-code" content="([0-9]{3})" ?\/?>/i,
            headerMatch = /<meta name="prerender-header" content="(.*?): ?(.*?)" ?\/?>/gi,
            head = req.prerender.documentHTML.split("</head>", 1).pop(),
            statusCode = 200,
            match;

        if (match = statusMatch.exec(head)) {
            var statusCode = match[1];
        }

        while (match = headerMatch.exec(head)) {
            res.setHeader(match[1], match[2]);
        }

        if (statusCode != 200) {
            res.send(statusCode, req.prerender.documentHTML);
        } else {
            next();
        }
    }
}
