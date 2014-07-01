module.exports = {
    beforeSend: function(req, res, next) {
        if(req.prerender.documentHTML) {

            var html = req.prerender.documentHTML.toString(),
                statusCode = 200,
                metaTagExpr = /<meta(?:\s*(?:[^\/>=]+)(?:=(?:'[^']*'|"[^"]*"))?)*\s*\/?>/gi,
                nameExpr = /name=['"]([^'"]*)['"]/i,
                codeExpr = /content=['"](\d{3})['"]/i,
                headerExpr = /content=['"]([^'"]*?): ?([^'"]*?)['"]/i,
                toRemove = [], 
                metaTagMatch, nameMatch, codeMatch, headerMatch;

            while ((metaTagMatch = metaTagExpr.exec(html))) {
                if((nameMatch = nameExpr.exec(metaTagMatch[0]))){

                    if(nameMatch[1] === 'prerender-status-code' &&
                        (codeMatch = codeExpr.exec(metaTagMatch[0]))){
                        statusCode = codeMatch[1];
                        toRemove.push(metaTagMatch[0]);
                    }

                    if (nameMatch[1] === 'prerender-header' &&
                        (headerMatch = headerExpr.exec(metaTagMatch[0]))) {
                        res.setHeader(headerMatch[1], headerMatch[2]);
                        toRemove.push(metaTagMatch[0]);
                    }
                }
            }

            if(toRemove.length) {
                var item;
                while ((item = toRemove.pop())) {
                    html = html.replace(item, '');
                }
                req.prerender.documentHTML = html;
            }

            if (res.getHeader('Location')) {
                res.setHeader('Location', decodeURIComponent(res.getHeader('Location')));
            }

            if (statusCode !== 200) {
                return res.send(statusCode, req.prerender.documentHTML);
            }
        }

        next();
    }
};