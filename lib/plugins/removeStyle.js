/**
 * Remove styles
 * 
 * Styles are not used in indexing. So it is better to remove and make the page
 * small.
 * 
 * This plagin removes the page styles
 * 
 * @author Mostafa Barmshory(mostafa.barmshory@gmail.com)
 */
module.exports = {
        pageLoaded: (req, res, next) => {
            if (!req.prerender.content || req.prerender.renderType != 'html') {
                return next();
            }

            var content = req.prerender.content.toString();
            var matches = null;
            var patterns = [
                /<style(?:.*?)>(?:[\S\s]*?)<\/style>/gim,
                
                / class=\"(?:[^\"]*?)\"/gi,
                / style=\"(?:[^\"]*?)\"/gim,
                / draggable=\"(?:[^\"]*?)\"/gim,
                / color=\"(?:[^\"]*?)\"/gim,
                / tabindex=\"(?:[^\"]*?)\"/gim,
                / width=\"(?:[^\"]*?)\"/gim,
                / height=\"(?:[^\"]*?)\"/gim,
                / size=\"(?:[^\"]*?)\"/gim,
                / align=\"(?:[^\"]*?)\"/gim,
                ];

            for(let j = 0; j < patterns.length; j++){
                matches = content.match(patterns[j]);
                for (let i = 0; matches && i < matches.length; i++) {
                    content = content.replace(matches[i], '');
                }
            }

            req.prerender.content = content;
            next();
        }
};