module.exports = {
    beforeSend: function(req, res, next) {
        if(req.prerender.documentHTML) {
            var statusMatch = /<meta name=['"]prerender-status-code['"] content=['"]([0-9]{3})['"] ?\/?>/i,
                headerMatch = /<meta name=['"]prerender-header['"] content=['"](.*?): ?(.*?)['"] ?\/?>/gi,
                head = req.prerender.documentHTML.split('</head>', 1).pop(),
                statusCode = 200,
                match;

            if (match = statusMatch.exec(head)) {
                statusCode = match[1];
                req.prerender.documentHTML = req.prerender.documentHTML.replace(match[0], '');
            }

            while (match = headerMatch.exec(head)) {
                res.setHeader(match[1], match[2]);
                req.prerender.documentHTML = req.prerender.documentHTML.replace(match[0], '');
            }

            if (statusCode != 200) {
                res.send(statusCode, req.prerender.documentHTML);
            }
        }

        next();
    }
}
