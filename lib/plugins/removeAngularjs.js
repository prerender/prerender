/**
 * Remove Angular tags
 * 
 * Some tags are used in Angularjs and is not useful in the SEO. For example the
 * following DIV
 * 
 * <div ng-if="ctrl.isPartEnable()">Hi</div>
 * 
 * is equal to:
 * 
 * <div>Hi</div>
 * 
 * This plagin remove Angularjs tags.
 * 
 * @see https://docs.angularjs.org/api/ng/directive
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
                // move to angular
                /(\s)+ng-(?:[^=]+)=\"(?:[^\"]*)\"/gim,
                /(\s)+data-ng-(?:[^=]+)=\"(?:[^\"]*)\"/gim,
                /(\s)+transclude=\"(?:[^\"]*)\"/gim,
                /<!--(\s)*ng(?:\w+)\:((?!-->).)*-->/gi,
                /<!--(\s)*end ng(?:\w+)\:((?!-->).)*-->/gi,
                
                // move to angular-material design
                /(\s)+md-(?:[^=]+)=\"(?:[^\"]*)\"/gim,
                /(\s)+data-md-(?:[^=]+)=\"(?:[^\"]*)\"/gim,
                /(\s)+layout=\"(?:[^\"]*)\"/gim,
                /(\s)+layout-(?:[^=]+)=\"(?:[^\"]*)\"/gim,
                /(\s)+flex=\"(?:[^\"]*)\"/gim,
                /(\s)+flex-(?:[^=]+)=\"(?:[^\"]*)\"/gim,
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